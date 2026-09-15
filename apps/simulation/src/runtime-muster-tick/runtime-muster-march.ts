import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceToroidal, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { buildTerrainDistanceField } from "./muster-march-pathfinding.js";
import { ADVANCE_EMPTY_COOLDOWN_MS, ADVANCE_FAR_COOLDOWN_MS, ADVANCE_MAX_RANGE_TILES, ADVANCE_THROTTLE_DIST, lockSourcedFromMusterTile, syncMusterStatus } from "./muster-auto-fire-shared.js";

/**
 * MARCH auto-fire: like ADVANCE, but instead of firing at the nearest
 * attackable enemy tile, it steers toward a chosen (targetX, targetY) tile.
 * The BFS crosses the player's own owned tiles, collecting every attackable
 * enemy tile found along the way, plus every neutral (unowned) LAND tile
 * bordering owned territory as an EXPAND candidate.
 *
 * Candidates are ranked by remaining road length to the target only: one
 * capture (the hop off owned land onto the candidate itself) + the real
 * tile-step distance from the candidate to the march target, from
 * buildTerrainDistanceField -- a BFS flood rooted at the target that walks
 * the actual grid (routing around water/impassable terrain) instead of
 * guessing a straight line, generalizing the same frontier-expansion BFS
 * pattern the client's road network builder uses. One flood per tick, rooted
 * at the target, gives every candidate an O(1) lookup instead of a search
 * each.
 *
 * Distance already covered getting from the flag to the candidate is
 * deliberately NOT added to this score: that leg crosses only the player's
 * own territory, which is free to move through, so charging it against a
 * candidate double-counts ground that cost nothing. (An earlier version did
 * add it -- see git history / muster-march.test.ts's "prefers a direct route
 * down a corridor over an equal-scoring detour" regression -- which biased
 * MARCH away from candidates reached via a longer-but-free owned corridor,
 * toward closer-to-the-flag candidates that were actually a worse route to
 * the target.) The BFS's own hop-count from the flag is still used, but only
 * to bound how far the search walks through owned territory (see
 * ADVANCE_MAX_RANGE_TILES below) -- never as part of the ranking.
 *
 * MARCH picks whichever candidate, attack or expand, has the shorter
 * remaining road, since the point of MARCH is the fastest route to the
 * target regardless of whether that route is fought or walked. An attack is
 * used as a tiebreak when both are equal.
 *
 * Every command MARCH issues (ATTACK or EXPAND) carries musterSourceX/Y set
 * to the flag's own tile, not whatever intermediate owned tile the BFS
 * launches the final hop from — runtime-frontier-command.ts uses that to
 * charge the same mechanical travel-time delay against both, attributed to
 * the flag itself, matching a company that has to march the whole way there
 * regardless of which command it ultimately executes.
 *
 * This whole scan re-runs from scratch every muster tick (see
 * runtime-muster-tick.ts) for as long as the flag stays in MARCH mode, so
 * the route is continuously re-planned against the current map as territory
 * changes hands -- there's no one-shot plan computed at march-start that
 * could go stale. maybeMarchFire itself ends the march (falls back to HOLD)
 * once the target tile is actually owned by the player; see that check
 * below.
 */
export const maybeMarchFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);
  const targetX = musterTile.muster?.targetX;
  const targetY = musterTile.muster?.targetY;

  if (targetX === undefined || targetY === undefined) {
    // No target set (shouldn't happen — SET_MUSTER requires one for MARCH) —
    // nothing to steer toward, so just back off.
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  // Target already ours — the march is complete. Fall back to HOLD so the
  // flag stops searching and the client sees the march end.
  const targetTile = input.tiles.get(simulationTileKey(targetX, targetY));
  if (targetTile?.ownerId === playerId) {
    const { targetX: _targetX, targetY: _targetY, ...restMuster } = musterTile.muster!;
    const clearedTile: DomainTileState = {
      ...musterTile,
      muster: { ...restMuster, mode: "HOLD" }
    };
    input.replaceTileState(originKey, clearedTile);
    input.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `muster-march-complete:${playerId}:${originKey}:${input.nowMs}`,
      playerId,
      tileDeltas: [input.tileDeltaFromState(clearedTile)]
    });
    input.advanceCooldowns.delete(originKey);
    return;
  }

  const inFlightLock = lockSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLock) {
    // Verbatim resolvesAt, never Math.max(…, nowMs) — see the matching
    // comment in runtime-muster-tick.ts: re-clamping an overdue lock to nowMs
    // defeats syncMusterStatus's equality guard and persists a tile-delta
    // event every tick for as long as the lock stays stuck.
    const resolvesAt = inFlightLock.resolvesAt;
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: inFlightLock.targetX,
      fightY: inFlightLock.targetY
    });
    return;
  }

  // Not a new search, so carry the previous search's reason forward instead
  // of clearing it back to the generic cooldown text for the rest of the
  // cooldown window — see the matching comment in maybeAdvanceFire.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: false,
      nextActionAt: cooldownUntil,
      noTargetInRange: musterTile.muster?.noTargetInRange,
      insufficientManpower: musterTile.muster?.insufficientManpower
    });
    return;
  }

  if (musterAmount <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt, insufficientManpower: true });
    return;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // Real tile-step distances to the target, flooded outward from the target
  // itself (see buildTerrainDistanceField) instead of guessed from
  // coordinates. Capped generously past both legs of the trip the BFS below
  // could plausibly need to estimate -- the straight-line distance from the
  // flag to the target, plus the local radius the owned-territory walk is
  // bounded to -- so it covers every candidate the search can reach without
  // flooding the whole map when the target is far away or unreachable.
  const straightLineFlagToTarget = chebyshevDistanceToroidal(musterTile.x, musterTile.y, targetX, targetY);
  const terrainDistanceField = buildTerrainDistanceField(
    targetX,
    targetY,
    getTile,
    straightLineFlagToTarget + ADVANCE_MAX_RANGE_TILES + 2
  );
  // Tiles the flood never reached (cut off by water, out of the search cap,
  // or simply undefined on the map -- as most coordinates are in unit tests)
  // fall back to the straight-line estimate rather than being treated as
  // infinitely far away.
  const distanceToTarget = (x: number, y: number): number =>
    terrainDistanceField.get(simulationTileKey(x, y)) ?? chebyshevDistanceToroidal(x, y, targetX, targetY);

  // A march must never move away from its target: any candidate at least as
  // far from the target as the flag itself already is gets rejected below,
  // rather than letting the "shortest remaining road" ranking pick a
  // technically-cheap candidate that's actually a step backward.
  const distFlagToTarget = distanceToTarget(musterTile.x, musterTile.y);

  // BFS through connected owned tiles, collecting every attackable enemy
  // tile found along the way instead of stopping at the first one, plus
  // every neutral (unowned) LAND tile bordering owned territory as an
  // EXPAND candidate.
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const visited = new Set<string>([originKey]);
  // Actual BFS hop distance from the flag to each owned tile visited so far,
  // rather than straight-line Chebyshev distance — dock links let a tile be
  // one hop away while spatially far from the flag, so a flag->candidate
  // estimate has to follow the traversal, not the map coordinates.
  const hopsFromFlag = new Map<string, number>([[originKey, 0]]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; totalRoadDist: number } | undefined;
  let bestExpand: { from: DomainTileState; neutral: DomainTileState; totalRoadDist: number } | undefined;
  // Nearest reachable/unlocked enemy tile regardless of affordability — see
  // the matching field in maybeAdvanceFire for why this is tracked
  // separately from `best`.
  let foundUnaffordable = false;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);

    const dockLinkedKeys = input.dockLinksByDockTileKey.get(currentKey) ?? [];
    const bridgeLinkedKeys = bridgeLinksByKey.get(currentKey) ?? [];
    const neighborCoords = [
      ...coordsInChebyshevRadius(current.x, current.y, 1),
      ...dockLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      }),
      ...bridgeLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      })
    ];

    for (const { x, y } of neighborCoords) {
      const neighbor = getTile(x, y);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nKey = simulationTileKey(x, y);

      if (neighbor.ownerId === playerId) {
        // Bound the walk to the same local radius ADVANCE uses. MARCH had no
        // range limit at all -- not even a filter on the chosen candidate --
        // so every raised MARCH flag re-walked the player's entire connected
        // territory every tick, collecting and ranking every enemy tile *and*
        // (since 2042f17d) every bordering neutral tile along the way. That
        // is the hot loop that saturated prod's single shared CPU under live
        // load; it only bites while players are online with flags raised,
        // which is why it looked load-dependent rather than constant.
        //
        // A muster flag is a local front-line order, so this bounds how far
        // the search walks through owned territory to the same local radius
        // ADVANCE uses, rather than the whole empire, so a march can no
        // longer hijack itself toward something on the far side of the map.
        // This hop-count is only ever used for that bound -- see the module
        // doc comment for why it's deliberately not part of candidate
        // ranking.
        if (!visited.has(nKey) && hopsFromFlag.get(currentKey)! + 1 < ADVANCE_MAX_RANGE_TILES) {
          visited.add(nKey);
          hopsFromFlag.set(nKey, hopsFromFlag.get(currentKey)! + 1);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        if (musterAmount >= input.requiredMusterForTarget(neighbor)) {
          const distToTarget = distanceToTarget(neighbor.x, neighbor.y);
          // Never fire on a candidate that's no closer to the target than the
          // flag already is — see distFlagToTarget's comment above.
          if (distToTarget < distFlagToTarget) {
            // Distance already covered from the flag to `current` is NOT
            // added here -- see the module doc comment for why folding owned
            // (free) territory into the score biases MARCH away from
            // otherwise-better candidates reached via a longer owned
            // corridor.
            const totalRoadDist = 1 + distToTarget;
            if (!best || totalRoadDist < best.totalRoadDist) {
              best = { from: current, enemy: neighbor, totalRoadDist };
            }
          }
        } else {
          foundUnaffordable = true;
        }
      } else if (
        // Deliberately NOT reach-gated. validateFrontierCommand allows EXPAND
        // onto neutral land outside the actor's reach border -- see the
        // "EXPAND is intentionally NOT reach-gated" comment there -- paid for
        // with out-of-reach frontier decay if reach never catches up. Filtering
        // reach here made MARCH stricter than the rules it dispatches into: a
        // flag on an out-of-reach frontier edge found no candidate anywhere
        // near its target, silently fell through to the globally cheapest
        // candidate back inside the reach disk, and reported fighting on the
        // far side of the empire instead of walking the two tiles it was told
        // to walk. Do not reintroduce the gate without also gating EXPAND in
        // validateFrontierCommand.
        !neighbor.ownerId &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        const distToTarget = distanceToTarget(x, y);
        // Same progress guard as the attack branch above — never expand onto
        // a tile that's no closer to the target than the flag already is.
        if (distToTarget < distFlagToTarget) {
          // Same "don't charge for free owned ground" rule as the attack
          // branch above.
          const totalRoadDist = 1 + distToTarget;
          if (!bestExpand || totalRoadDist < bestExpand.totalRoadDist) {
            bestExpand = { from: current, neutral: neighbor, totalRoadDist };
          }
        }
      }
    }
  }

  if (!best && !bestExpand) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: false,
      nextActionAt,
      insufficientManpower: foundUnaffordable,
      noTargetInRange: !foundUnaffordable
    });
    return;
  }

  // Shortest total road from the flag, through the candidate, to the target
  // wins, whether that road is fought or walked; an attack is the tiebreak
  // when both are equally short.
  const useAttack = !!best && (!bestExpand || best.totalRoadDist <= bestExpand.totalRoadDist);

  const totalRoadDist = useAttack ? best!.totalRoadDist : bestExpand!.totalRoadDist;
  if (totalRoadDist > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }

  const from = useAttack ? best!.from : bestExpand!.from;
  const to = useAttack ? best!.enemy : bestExpand!.neutral;
  // The command fires unconditionally below — mark in-flight now rather than
  // waiting for the lock to show up next tick.
  syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
    inFlight: true,
    nextActionAt: undefined,
    fightX: to.x,
    fightY: to.y
  });
  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-march",
    playerId,
    simulationTileKey(to.x, to.y),
    input.nowMs
  );
  input.handleFrontierCommand(
    {
      commandId,
      sessionId: `system-runtime:territory-automation:${playerId}`,
      playerId,
      clientSeq: 0,
      issuedAt: input.nowMs,
      type: useAttack ? "ATTACK" : "EXPAND",
      payloadJson: JSON.stringify({
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        musterSourceX: musterTile.x,
        musterSourceY: musterTile.y
      })
    },
    useAttack ? "ATTACK" : "EXPAND"
  );
};
