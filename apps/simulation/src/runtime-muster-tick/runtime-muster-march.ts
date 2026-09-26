import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceToroidal, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { buildTerrainDistanceField, deviationFromMarchLine } from "./muster-march-pathfinding.js";
import { ADVANCE_EMPTY_COOLDOWN_MS, ADVANCE_FAR_COOLDOWN_MS, ADVANCE_MAX_RANGE_TILES, ADVANCE_THROTTLE_DIST, locksSourcedFromMusterTile, syncMusterStatus } from "./muster-auto-fire-shared.js";
import { MUSTER_MAX_CONCURRENT_ACTIONS, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type MarchRouteScore = { routeLength: number; hitsSettled: boolean; remainingToTarget: number; lineDeviation: number };

// Floating-point slack for comparing lineDeviation values.
const LINE_DEVIATION_EPSILON = 1e-9;

/** True when route `a` strictly beats `b` under MARCH's straightest-route ranking. */
const isStraighterRoute = (a: MarchRouteScore, b: MarchRouteScore): boolean => {
  if (a.routeLength !== b.routeLength) return a.routeLength < b.routeLength;
  if (a.hitsSettled !== b.hitsSettled) return !a.hitsSettled;
  if (a.remainingToTarget !== b.remainingToTarget) return a.remainingToTarget < b.remainingToTarget;
  return a.lineDeviation < b.lineDeviation - LINE_DEVIATION_EPSILON;
};

/**
 * MARCH auto-fire: like ADVANCE, but instead of firing at the nearest
 * attackable enemy tile, it steers toward a chosen (targetX, targetY) tile.
 * The BFS crosses the player's own owned tiles, collecting every attackable
 * enemy tile found along the way, plus every neutral (unowned) LAND tile
 * bordering owned territory as an EXPAND candidate.
 *
 * MARCH follows the straightest route from the flag to the target. It does
 * not try to be clever about capture speed (attack vs expand timings) --
 * route choice is the player's job; the flag just walks the line it was
 * given. Candidates are ranked by, in order:
 *
 *   1. Whole-route length: BFS hops from the flag to the candidate + the real
 *      tile-step distance from the candidate to the target (from
 *      buildTerrainDistanceField, a flood rooted at the target that routes
 *      around water instead of guessing a straight line). This is the length
 *      of the shortest flag -> candidate -> target route, so a candidate that
 *      needs a detour -- e.g. marching far along owned ground to find a
 *      shortcut fight -- loses to one on the direct line.
 *   2. Frontier over settled: among equally short routes, a candidate that
 *      isn't a SETTLED enemy tile (enemy frontier, barbarian, or neutral
 *      land) wins, since settled ground is a real fight that can fail. It is
 *      only a tiebreak -- MARCH never takes a longer route to dodge settled
 *      ground; the player picks a different target for that.
 *   3. Remaining distance to the target: among equally short routes, the
 *      candidate furthest along the route wins. Without this, the earlier
 *      hop-counting version tie-broke by BFS discovery order and picked a
 *      sideways detour over the straight continuation down an owned corridor
 *      (see muster-march-routing.test.ts's corridor regression).
 *   4. Perpendicular distance from the straight flag -> target line
 *      (deviationFromMarchLine): Chebyshev movement has many equally short
 *      routes, so this keeps the march on the ruler-drawn line.
 *
 * Attack and expand candidates share the same ranking; an attack wins an
 * exact tie.
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

  const inFlightLocks = locksSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLocks.length >= MUSTER_MAX_CONCURRENT_ACTIONS) {
    // Verbatim resolvesAt, never Math.max(…, nowMs) — see the matching
    // comment in runtime-muster-tick.ts: re-clamping an overdue lock to nowMs
    // defeats syncMusterStatus's equality guard and persists a tile-delta
    // event every tick for as long as the lock stays stuck.
    const nextLock = inFlightLocks.reduce((soonest, lock) => lock.resolvesAt < soonest.resolvesAt ? lock : soonest);
    const resolvesAt = nextLock.resolvesAt;
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: nextLock.targetX,
      fightY: nextLock.targetY,
      inFlightCount: inFlightLocks.length
    });
    return;
  }

  // Not a new search, so carry the previous search's reason forward instead
  // of clearing it back to the generic cooldown text for the rest of the
  // cooldown window — see the matching comment in maybeAdvanceFire.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt: cooldownUntil,
      noTargetInRange: musterTile.muster?.noTargetInRange,
      insufficientManpower: musterTile.muster?.insufficientManpower
    });
    return;
  }

  const reservedMuster = inFlightLocks.reduce((total, lock) => total + (lock.actionType === "ATTACK" ? lock.manpowerCost : 0), 0);
  const availableMuster = Math.max(0, musterAmount - reservedMuster);
  if (availableMuster <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: inFlightLocks.length > 0, inFlightCount: inFlightLocks.length, nextActionAt, insufficientManpower: true });
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
  // rather than letting the route ranking pick a candidate that's actually a
  // step backward.
  const distFlagToTarget = distanceToTarget(musterTile.x, musterTile.y);

  // Actual BFS hop distance from the flag to each owned tile visited so far,
  // rather than straight-line Chebyshev distance — dock links let a tile be
  // one hop away while spatially far from the flag, so a flag->candidate
  // estimate has to follow the traversal, not the map coordinates.
  const hopsFromFlag = new Map<string, number>([[originKey, 0]]);

  // See the module doc comment for the four-level ranking this encodes.
  const scoreCandidate = (fromKey: string, candidate: DomainTileState): MarchRouteScore => {
    const remainingToTarget = distanceToTarget(candidate.x, candidate.y);
    return {
      routeLength: hopsFromFlag.get(fromKey)! + 1 + remainingToTarget,
      hitsSettled: !!candidate.ownerId && candidate.ownershipState === "SETTLED",
      remainingToTarget,
      lineDeviation: deviationFromMarchLine(musterTile.x, musterTile.y, targetX, targetY, candidate.x, candidate.y, WORLD_WIDTH, WORLD_HEIGHT)
    };
  };

  // BFS through connected owned tiles, collecting every attackable enemy
  // tile found along the way instead of stopping at the first one, plus
  // every neutral (unowned) LAND tile bordering owned territory as an
  // EXPAND candidate.
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const visited = new Set<string>([originKey]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; score: MarchRouteScore } | undefined;
  let bestExpand: { from: DomainTileState; neutral: DomainTileState; score: MarchRouteScore } | undefined;
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
        if (availableMuster >= input.requiredMusterForTarget(neighbor)) {
          const score = scoreCandidate(currentKey, neighbor);
          // Never fire on a candidate that's no closer to the target than the
          // flag already is — see distFlagToTarget's comment above.
          if (score.remainingToTarget < distFlagToTarget && (!best || isStraighterRoute(score, best.score))) {
            best = { from: current, enemy: neighbor, score };
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
        const score = scoreCandidate(currentKey, neighbor);
        // Same progress guard as the attack branch above — never expand onto
        // a tile that's no closer to the target than the flag already is.
        if (score.remainingToTarget < distFlagToTarget && (!bestExpand || isStraighterRoute(score, bestExpand.score))) {
          bestExpand = { from: current, neutral: neighbor, score };
        }
      }
    }
  }

  if (!best && !bestExpand) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt,
      insufficientManpower: foundUnaffordable,
      noTargetInRange: !foundUnaffordable
    });
    return;
  }

  // Straightest route wins whether it's fought or walked; an attack wins an
  // exact tie.
  const useAttack = !!best && (!bestExpand || !isStraighterRoute(bestExpand.score, best.score));

  const remainingRoadDist = 1 + (useAttack ? best!.score.remainingToTarget : bestExpand!.score.remainingToTarget);
  if (remainingRoadDist > ADVANCE_THROTTLE_DIST) {
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
    inFlightCount: inFlightLocks.length + 1,
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
