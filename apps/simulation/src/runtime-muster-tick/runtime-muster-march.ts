import type { DomainTileState } from "@border-empires/game-domain";
import { coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { deviationFromMarchLine } from "./muster-march-pathfinding.js";
import { planMarchRoute } from "./muster-march-route-plan.js";
import { endMarch, isStraighterRoute, type MarchRouteScore } from "./muster-march-route.js";
import { ADVANCE_EMPTY_COOLDOWN_MS, ADVANCE_FAR_COOLDOWN_MS, ADVANCE_MAX_RANGE_TILES, ADVANCE_THROTTLE_DIST, locksSourcedFromMusterTile, syncMusterStatus } from "./muster-auto-fire-shared.js";
import { MUSTER_MARCH_MAX_ROUTE_STEPS, MUSTER_MAX_CONCURRENT_ACTIONS, WORLD_HEIGHT, WORLD_WIDTH, flagCommitForTarget, musterFlagCap } from "@border-empires/shared";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { countSiegeAttackVectors, isMarchSiegeTarget, MARCH_ROUTE_CORRIDOR_SLACK, MARCH_SIEGE_ATTACK_VECTORS, touchesSiegeTarget } from "./muster-march-siege.js";

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
 *   2. Remaining distance to the target: among equally short routes, the
 *      candidate furthest along the route wins. Without this, the earlier
 *      hop-counting version tie-broke by BFS discovery order and picked a
 *      sideways detour over the straight continuation down an owned corridor
 *      (see muster-march-routing.test.ts's corridor regression).
 *   3. Perpendicular distance from the straight flag -> target line
 *      (deviationFromMarchLine): Chebyshev movement has many equally short
 *      routes, so this keeps the march on the ruler-drawn line.
 *   4. Frontier over settled: among routes equally short *and* equally
 *      straight, a candidate that isn't a SETTLED enemy tile (enemy
 *      frontier, barbarian, or neutral land) wins, since settled ground is a
 *      real fight that can fail. It must stay below line deviation: ranked
 *      above it, every diagonal neutral tile beside an enemy border tied the
 *      settled tile on the line and won, so a march ordered into enemy
 *      territory skirted around it across neutral land instead of going in
 *      (see muster-march-routing.test.ts's skirting regression).
 *
 * Attack and expand candidates share the same ranking; an attack wins an
 * exact tie.
 *
 * Returns true when it launched a command that was accepted.
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
export type MarchFireOptions = {
  // Steer toward this tile instead of the flag's own march target. Used by an
  // ADVANCE flag closing on a barbarian that doesn't touch its territory yet
  // (muster-advance-fire.ts); the flag's mode/target are left untouched.
  target?: { x: number; y: number };
  // Only expand across neutral land, never attack on the way. ADVANCE uses it
  // so closing on a barbarian can't pick a fight with another player.
  expandOnly?: boolean;
};

const musterFlagCapFor = (input: MusterTickInput, playerId: string, musterTile: DomainTileState): number => {
  const player = input.players.get(playerId);
  return musterFlagCap(player ? input.playerManpowerCap(player) : Number.MAX_SAFE_INTEGER, musterTile.muster?.capLevel);
};

export const maybeMarchFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string, options: MarchFireOptions = {}): boolean => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);
  const targetX = options.target?.x ?? musterTile.muster?.targetX;
  const targetY = options.target?.y ?? musterTile.muster?.targetY;

  if (targetX === undefined || targetY === undefined) {
    // No target set (shouldn't happen — SET_MUSTER requires one for MARCH) —
    // nothing to steer toward, so just back off.
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return false;
  }

  // Target already ours — the march is complete. Fall back to HOLD so the
  // flag stops searching and the client sees the march end.
  const targetTile = input.tiles.get(simulationTileKey(targetX, targetY));
  if (!options.target && targetTile?.ownerId === playerId) {
    endMarch(input, musterTile, originKey, playerId, "complete");
    return false;
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
    return false;
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
    return false;
  }

  const reservedMuster = inFlightLocks.reduce((total, lock) => total + (lock.actionType === "ATTACK" ? lock.manpowerCost : 0), 0);
  const availableMuster = Math.max(0, musterAmount - reservedMuster);
  if (availableMuster <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: inFlightLocks.length > 0, inFlightCount: inFlightLocks.length, nextActionAt, insufficientManpower: true });
    return false;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // The route, planned from terrain alone and cached briefly (see
  // muster-march-route-plan.ts): real tile-step distances to the target
  // through the same dock/bridge edges the owned-territory walk below takes,
  // and the one straightest path the march follows.
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const crossingKeysFor = (key: string): readonly string[] | undefined => {
    const dockKeys = input.dockCrossingTargetsByDockTileKey.get(key);
    const bridgeKeys = bridgeLinksByKey.get(key);
    if (!dockKeys) return bridgeKeys;
    return bridgeKeys ? [...dockKeys, ...bridgeKeys] : dockKeys;
  };
  const { distanceToTarget, flagReachedByFlood, pathBand, walkBand } = planMarchRoute({
    tiles: input.tiles,
    playerId,
    flag: musterTile,
    target: { x: targetX, y: targetY },
    nowMs: input.nowMs,
    crossingKeysFor,
    crossingSignature: `${[...bridgeLinksByKey.keys()].sort().join(";")}|${input.dockLinksByDockTileKey.size}`
  });

  // A march must never move away from its target: any candidate at least as
  // far from the target as the flag itself already is gets rejected below,
  // rather than letting the route ranking pick a candidate that's actually a
  // step backward.
  const distFlagToTarget = distanceToTarget(musterTile.x, musterTile.y);
  // The route corridor (see MARCH_ROUTE_CORRIDOR_SLACK): the walk and every
  // candidate stay within a few steps of the straightest route to the target.
  const corridorLimit = distFlagToTarget + MARCH_ROUTE_CORRIDOR_SLACK;

  // Actual BFS hop distance from the flag to each owned tile visited so far,
  // rather than straight-line Chebyshev distance — dock links let a tile be
  // one hop away while spatially far from the flag, so a flag->candidate
  // estimate has to follow the traversal, not the map coordinates.
  const hopsFromFlag = new Map<string, number>([[originKey, 0]]);

  // See the module doc comment for the ranking this encodes; offPath (the
  // traced path's band, see muster-march-route.ts) ranks above all of it.
  const scoreCandidate = (fromKey: string, candidate: DomainTileState): MarchRouteScore => {
    const remainingToTarget = distanceToTarget(candidate.x, candidate.y);
    return {
      offPath: !pathBand.has(simulationTileKey(candidate.x, candidate.y)),
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
  const actor = input.players.get(playerId);
  // An enemy town/structure as the target: take tiles touching it until there
  // are MARCH_SIEGE_ATTACK_VECTORS fronts, then focus on the target itself.
  const siegeTarget = !options.target && isMarchSiegeTarget(targetTile, playerId, actor) ? targetTile : undefined;
  const siegeVectors = siegeTarget ? countSiegeAttackVectors(siegeTarget, playerId, getTile) : 0;
  // A ring tile (touching the siege target) to widen the foothold, and the
  // attack on the target itself, found during the walk below.
  let bestRing: { from: DomainTileState; to: DomainTileState; attack: boolean; score: MarchRouteScore } | undefined;
  let siegeAttack: { from: DomainTileState; required: number; affordable: boolean; locked: boolean } | undefined;
  const visited = new Set<string>([originKey]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; score: MarchRouteScore } | undefined;
  let bestExpand: { from: DomainTileState; neutral: DomainTileState; score: MarchRouteScore } | undefined;
  // Nearest reachable/unlocked enemy tile regardless of affordability — see
  // the matching field in maybeAdvanceFire for why this is tracked
  // separately from `best`.
  let foundUnaffordable = false;
  // Any LAND tile we don't own that is closer to the target than the flag,
  // whoever holds it and whether or not it is locked right now. When there is
  // none, the march is stuck because of the terrain, not a passing fight.
  let landStepCloser = false;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);

    const dockLinkedKeys = input.dockCrossingTargetsByDockTileKey.get(currentKey) ?? [];
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
      if (!landStepCloser && neighbor.ownerId !== playerId && distanceToTarget(x, y) < distFlagToTarget) landStepCloser = true;

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
        //
        // Past that radius MARCH keeps walking, but only along the traced path
        // (walkBand, a strip MARCH_WALK_BAND_RADIUS either side) and up to
        // MUSTER_MARCH_MAX_ROUTE_STEPS hops: a march around mountains needs far
        // more than 10, and stalling there is what made a stuck march spread
        // sideways. Inside the route corridor either way, so the walk costs the
        // old disc plus a narrow strip, not the whole flag-to-target diamond.
        const nextHops = hopsFromFlag.get(currentKey)! + 1;
        const inReach = nextHops < ADVANCE_MAX_RANGE_TILES || (nextHops < MUSTER_MARCH_MAX_ROUTE_STEPS && walkBand.has(nKey));
        if (!visited.has(nKey) && inReach && nextHops + distanceToTarget(x, y) <= corridorLimit) {
          visited.add(nKey);
          hopsFromFlag.set(nKey, nextHops);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        !options.expandOnly &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        // Never "fight" an ally or truced player -- see the matching filter in
        // muster-advance-fire.ts.
        !(actor && isAlliedOrTruced(actor, neighbor.ownerId)) &&
        siegeTarget &&
        nKey === simulationTileKey(siegeTarget.x, siegeTarget.y)
      ) {
        // The siege target itself: remember the first front that can hit it,
        // preferring one we can afford and that isn't tied up in a fight.
        const required = input.requiredMusterForTarget(neighbor, playerId);
        const locked = !!input.locksByTile.targetLockAt(currentKey) || !!input.locksByTile.targetLockAt(nKey);
        if (!siegeAttack || (siegeAttack.locked && !locked)) siegeAttack = { from: current, required, affordable: availableMuster >= required, locked };
      } else if (
        neighbor.ownerId &&
        !options.expandOnly &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        !(actor && isAlliedOrTruced(actor, neighbor.ownerId)) &&
        !input.locksByTile.targetLockAt(currentKey) &&
        !input.locksByTile.targetLockAt(nKey)
      ) {
        if (availableMuster >= input.requiredMusterForTarget(neighbor, playerId)) {
          const score = scoreCandidate(currentKey, neighbor);
          if (siegeTarget && touchesSiegeTarget(neighbor, siegeTarget)) {
            if (!bestRing || isStraighterRoute(score, bestRing.score)) bestRing = { from: current, to: neighbor, attack: true, score };
          }
          // Never fire on a candidate that's no closer to the target than the
          // flag already is — see distFlagToTarget's comment above — or that
          // leaves the route corridor.
          if (score.remainingToTarget < distFlagToTarget && score.routeLength <= corridorLimit && (!best || isStraighterRoute(score, best.score))) {
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
        !input.locksByTile.targetLockAt(currentKey) &&
        !input.locksByTile.targetLockAt(nKey)
      ) {
        const score = scoreCandidate(currentKey, neighbor);
        if (siegeTarget && touchesSiegeTarget(neighbor, siegeTarget)) {
          if (!bestRing || isStraighterRoute(score, bestRing.score)) bestRing = { from: current, to: neighbor, attack: false, score };
        }
        // Same progress and corridor guards as the attack branch above.
        if (score.remainingToTarget < distFlagToTarget && score.routeLength <= corridorLimit && (!bestExpand || isStraighterRoute(score, bestExpand.score))) {
          bestExpand = { from: current, neutral: neighbor, score };
        }
      }
    }
  }

  // Siege focus (enemy town/structure target): widen the foothold around the
  // target to MARCH_SIEGE_ATTACK_VECTORS tiles, then attack the target and
  // nothing else -- saving up for it rather than wandering off to expand.
  const holdFoothold = siegeVectors >= MARCH_SIEGE_ATTACK_VECTORS || !bestRing;
  if (siegeTarget && siegeAttack && holdFoothold) {
    if (siegeAttack.affordable && !siegeAttack.locked) {
      best = { from: siegeAttack.from, enemy: siegeTarget, score: scoreCandidate(simulationTileKey(siegeAttack.from.x, siegeAttack.from.y), siegeTarget) };
      bestExpand = undefined;
    } else {
      const nextActionAt = input.nowMs + (siegeAttack.locked ? ADVANCE_FAR_COOLDOWN_MS : ADVANCE_EMPTY_COOLDOWN_MS);
      input.advanceCooldowns.set(originKey, nextActionAt);
      syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
        inFlight: inFlightLocks.length > 0,
        inFlightCount: inFlightLocks.length,
        nextActionAt,
        insufficientManpower: !siegeAttack.affordable,
        // More than the flag can ever hold: say so (the client offers Expand
        // Capacity) rather than wait silently forever.
        unfundableTarget: !siegeAttack.affordable && siegeAttack.required > musterFlagCapFor(input, playerId, musterTile) ? { x: siegeTarget.x, y: siegeTarget.y, required: siegeAttack.required } : undefined
      });
      return false;
    }
  } else if (siegeTarget && bestRing && siegeVectors < MARCH_SIEGE_ATTACK_VECTORS) {
    if (bestRing.attack) {
      best = { from: bestRing.from, enemy: bestRing.to, score: bestRing.score };
      bestExpand = undefined;
    } else {
      bestExpand = { from: bestRing.from, neutral: bestRing.to, score: bestRing.score };
      best = undefined;
    }
  }

  // Off the path band only once nothing is in flight: while the flag's own
  // fights on the path are still resolving, wait for them rather than spread.
  // MARCH only: an ADVANCE flag approaching a hostile (options.target) counts
  // its unrelated fights as in flight too, and must keep approaching.
  const holdForPath = !options.target && inFlightLocks.length > 0;
  if (holdForPath && best?.score.offPath) best = undefined;
  if (holdForPath && bestExpand?.score.offPath) bestExpand = undefined;

  if (!best && !bestExpand) {
    // Stop short: the target is a mountain or sea tile, or land the terrain
    // flood never connected to the flag (an isle with no dock or bridge, or a
    // route longer than the flood cap), and no land on our side gets any
    // closer. The player may have aimed into unexplored ground without
    // knowing, so this ends the march quietly at the closest point instead of
    // retrying forever as "no target in range". landStepCloser already counts
    // closer tiles the flag can't afford, so an unaffordable tile behind the
    // flag must not keep the march alive. Wait for the flag's own steps in
    // flight to resolve first: one may still capture closer ground.
    const targetUnreachable = targetTile?.terrain !== "LAND" || !flagReachedByFlood;
    if (!options.target && inFlightLocks.length === 0 && !landStepCloser && targetUnreachable) {
      endMarch(input, musterTile, originKey, playerId, "stopped-short");
      return false;
    }
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt,
      insufficientManpower: foundUnaffordable,
      noTargetInRange: !foundUnaffordable
    });
    return false;
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
  const commitManpower = useAttack ? flagCommitForTarget(to, musterTile.muster?.commitManpower, input.nowMs) : undefined;
  const result = input.handleFrontierCommand(
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
        musterSourceY: musterTile.y,
        // docs/replenishment-update-plan.md D6: carry this flag's chosen
        // commitment into the ATTACK it fires -- but only against a SETTLED
        // target or a FRONTIER tile still holding captured ground, where the
        // commit-odds multiplier actually does anything (scaled to a held
        // tile's cheaper floor by flagCommitForTarget). Any other FRONTIER
        // target auto-captures regardless of commitment
        // (resolveAttackCombat's GUARANTEED_CAPTURE path), so spending the
        // flag's full commitManpower there would just waste manpower on a
        // win that was already free. EXPAND has no commitManpower field.
        ...(commitManpower ? { commitManpower } : {})
      })
    },
    useAttack ? "ATTACK" : "EXPAND"
  );
  // A rejected command (no coin/manpower, tile locked...) must not be retried
  // every second now that flags tick at 1s -- back off like a far target.
  if (!result.accepted) input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  return result.accepted;
};
