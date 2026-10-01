import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MAX_CONCURRENT_ACTIONS } from "@border-empires/shared";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { maybeMarchFire } from "./runtime-muster-march.js";
import { completeAdvanceClearing, isHumanFlagOwner, markAdvanceClearing, nearestBarbarianInRange } from "./muster-advance-clear.js";
import {
  ADVANCE_EMPTY_COOLDOWN_MS,
  ADVANCE_FAR_COOLDOWN_MS,
  ADVANCE_MAX_RANGE_TILES,
  ADVANCE_THROTTLE_DIST,
  locksSourcedFromMusterTile,
  syncMusterStatus
} from "./muster-auto-fire-shared.js";

// Split out of runtime-muster-tick.ts (a pure code move) so that file keeps
// room for the tick orchestration; the MARCH counterpart lives in
// runtime-muster-march.ts.

/**
 * ADVANCE auto-fire: BFS through connected owned tiles from the muster tile,
 * collecting every attackable enemy tile reachable that way, then fires at
 * whichever one is genuinely nearest instead of stopping at the first hit —
 * BFS visiting order tracks hop count from the flag, and two candidates found
 * at the same hop depth can still sit at very different real distances once
 * the frontier bends around locked/contested tiles, so ties are broken by
 * Chebyshev distance to the flag. BFS guarantees the firing tile is reachable
 * via a chain of owned tiles, preventing attacks sourced from isolated
 * territory pockets disconnected from the muster flag.
 *
 * "Nearest" and the range cap are both measured in BFS hops, not raw
 * Chebyshev distance — a dock link is one hop regardless of how far apart the
 * paired docks sit on the map, so a legitimate cross-water ADVANCE flag isn't
 * penalized for the distance the dock crossing collapses. If the nearest
 * candidate found is beyond ADVANCE_MAX_RANGE_TILES hops — which happens once
 * every nearby front is locked by sibling flags or other combat — the flag
 * idles rather than striking across the map at whatever unlocked tile it
 * could still reach.
 *
 * Cooldown (stored in advanceCooldowns, lives on the Runtime):
 *   - Flag already has the maximum number of actions in flight → wait until a lock resolves
 *   - Enemy found within ADVANCE_THROTTLE_DIST hops → fire every tick
 *   - Enemy found beyond that (but within ADVANCE_MAX_RANGE_TILES) → ADVANCE_FAR_COOLDOWN_MS
 *   - Nothing attackable within range → ADVANCE_EMPTY_COOLDOWN_MS cooldown
 */
export const maybeAdvanceFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);

  const inFlightLocks = locksSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLocks.length >= MUSTER_MAX_CONCURRENT_ACTIONS) {
    // Use the lock's own resolvesAt verbatim, never Math.max(…, nowMs): an
    // overdue lock would otherwise re-clamp to nowMs on every tick, so
    // syncMusterStatus's equality guard never matches and each tick replaces
    // the tile and persists a TILE_DELTA_BATCH — an unbounded write flood per
    // stuck flag. The client already ignores a nextActionAt in the past.
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

  // Respect per-flag cooldown. Not a new search, so carry the previous
  // search's reason (noTargetInRange/insufficientManpower) forward instead
  // of clearing it back to the generic "Planning next move" text for the
  // rest of the cooldown window.
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

  // No manpower staged yet — skip the BFS entirely and back off. Zero staged
  // manpower can never afford any target, so this is always an
  // insufficient-manpower cooldown rather than "no target exists".
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

  // BFS through connected owned tiles, collecting every attackable enemy tile
  // found along the way instead of stopping at the first one. Tracks each
  // owned tile's hop depth from the flag (a dock link is one hop regardless
  // of the real distance it crosses) so both the range cap and the
  // nearest-candidate tie-break are dock-fair; Chebyshev distance only breaks
  // ties between candidates found at the same hop depth.
  // Uses a head pointer instead of shift() to keep dequeue O(1).
  const bridgeLinksByKey = input.aetherBridgeNeighborKeysForPlayer(playerId);
  const visited = new Set<string>([originKey]);
  const depthByKey = new Map<string, number>([[originKey, 0]]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; hops: number; dist: number } | undefined;
  // Nearest reachable/unlocked enemy tile regardless of whether this flag
  // can currently afford to attack it — tracked separately so, when `best`
  // ends up empty, the cooldown can say *why*: "insufficient manpower for a
  // real target" (this is set, within range) vs. "no target at all" (this
  // stays undefined, or is beyond ADVANCE_MAX_RANGE_TILES).
  let bestUnaffordable: { hops: number } | undefined;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);
    const currentDepth = depthByKey.get(currentKey)!;

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
        // Bound the traversal, not just the result. ADVANCE_MAX_RANGE_TILES
        // was previously only a filter on candidates (below, and at the
        // `best.hops >` check after the loop), so the walk itself still
        // covered the player's entire connected territory every tick, for
        // every raised flag -- O(owned tiles) of map lookups and per-tile
        // array allocation whose results were then thrown away past the cap.
        // On a big empire under live load that is the sim's hottest loop.
        //
        // Stopping here is result-identical: an owned tile at depth d only
        // contributes enemy candidates at d + 1, and every candidate past
        // ADVANCE_MAX_RANGE_TILES is discarded anyway. So a tile at depth
        // >= the cap can only produce already-rejected candidates, and never
        // expanding it cannot change which target is chosen.
        if (!visited.has(nKey) && currentDepth + 1 < ADVANCE_MAX_RANGE_TILES) {
          visited.add(nKey);
          depthByKey.set(nKey, currentDepth + 1);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        const hops = currentDepth + 1;
        if (availableMuster >= input.requiredMusterForTarget(neighbor)) {
          const dist = chebyshevDistanceSimple(musterTile.x, musterTile.y, neighbor.x, neighbor.y);
          if (!best || hops < best.hops || (hops === best.hops && dist < best.dist)) {
            best = { from: current, enemy: neighbor, hops, dist };
          }
        } else if (hops <= ADVANCE_MAX_RANGE_TILES && (!bestUnaffordable || hops < bestUnaffordable.hops)) {
          bestUnaffordable = { hops };
        }
      }
    }
  }

  // Nothing attackable at all, or the nearest candidate is beyond the hard
  // range cap (every closer front locked/contested) — idle rather than
  // striking whatever unlocked tile happens to be reachable, however far.
  if (!best || best.hops > ADVANCE_MAX_RANGE_TILES) {
    if (isHumanFlagOwner(input, playerId)) {
      // Barbarians that don't touch our border yet: close the distance by
      // expanding toward the nearest one (the next search then attacks it).
      const barbarian = nearestBarbarianInRange(input, musterTile);
      if (barbarian) {
        markAdvanceClearing(input, originKey);
        maybeMarchFire(input, input.tiles.get(originKey) ?? musterTile, playerId, { target: { x: barbarian.x, y: barbarian.y }, expandOnly: true });
        return;
      }
      // Nothing hostile left in range and nothing still fighting: the order
      // is done -- but only if it ever had something to do (see
      // MusterState.clearing), so a flag parked at a quiet front keeps waiting.
      if (musterTile.muster?.clearing && inFlightLocks.length === 0 && bestUnaffordable === undefined) {
        completeAdvanceClearing(input, originKey, playerId);
        return;
      }
    }
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt,
      insufficientManpower: bestUnaffordable !== undefined,
      noTargetInRange: bestUnaffordable === undefined
    });
    return;
  }

  const bestFrom = best.from;
  const nearestEnemy = best.enemy;

  if (best.hops > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }
  // The attack fires unconditionally below — mark in-flight now rather than
  // waiting for the lock to show up next tick, so the client doesn't flash
  // back to a stale "planning next move" state for one tick in between.
  syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
    inFlight: true,
    inFlightCount: inFlightLocks.length + 1,
    nextActionAt: undefined,
    fightX: nearestEnemy.x,
    fightY: nearestEnemy.y
  });

  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-advance",
    playerId,
    simulationTileKey(nearestEnemy.x, nearestEnemy.y),
    input.nowMs
  );
  markAdvanceClearing(input, originKey);
  const result = input.handleFrontierCommand(
    {
      commandId,
      sessionId: `system-runtime:territory-automation:${playerId}`,
      playerId,
      clientSeq: 0,
      issuedAt: input.nowMs,
      type: "ATTACK",
      // docs/replenishment-update-plan.md D6: carry this flag's chosen commitment into the ATTACK it fires -- only against a SETTLED target (see the matching comment in runtime-muster-march.ts's maybeMarchFire).
      payloadJson: JSON.stringify({ fromX: bestFrom.x, fromY: bestFrom.y, toX: nearestEnemy.x, toY: nearestEnemy.y, musterSourceX: musterTile.x, musterSourceY: musterTile.y, ...(nearestEnemy.ownershipState === "SETTLED" && musterTile.muster?.commitManpower ? { commitManpower: musterTile.muster.commitManpower } : {}) })
    },
    "ATTACK"
  );
  // A rejected attack must not be retried every second now that flags tick at
  // 1s -- back off like a far target.
  if (!result.accepted) input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
};
