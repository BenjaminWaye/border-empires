import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MAX_CONCURRENT_ACTIONS, musterFlagCap } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { maybeMarchFire } from "./runtime-muster-march.js";
import { scanAdvanceCandidates } from "./muster-advance-scan.js";
import { completeAdvanceClearing, isHumanFlagOwner, markAdvanceClearing, nearestHostileWithinSteps } from "./muster-advance-clear.js";
import {
  ADVANCE_EMPTY_COOLDOWN_MS,
  ADVANCE_FAR_COOLDOWN_MS,
  ADVANCE_THROTTLE_DIST,
  locksSourcedFromMusterTile,
  pickAdvanceTarget,
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
 * The flag commits to that nearest tile: if it can't afford it yet (a SETTLED
 * tile costs more than a FRONTIER one) it saves up instead of spending on a
 * cheaper, farther tile -- otherwise cheap frontier attacks would drain it
 * before it ever reached the settled cost. A tile above the flag's own cap
 * (musterFlagCap) is skipped and reported via MusterState.unfundableTarget.
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
      insufficientManpower: musterTile.muster?.insufficientManpower,
      unfundableTarget: musterTile.muster?.unfundableTarget
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

  const { nearest, nearestAffordable } = scanAdvanceCandidates(input, musterTile, playerId, availableMuster);

  // The flag commits to its nearest target and saves up for it rather than
  // spending on a cheaper, farther one; only a target the flag can't hold
  // (above its musterFlagCap) is skipped, and reported in `unfundable`.
  const player = input.players.get(playerId);
  const { best, unfundable } = nearest
    ? pickAdvanceTarget(nearest, nearestAffordable, availableMuster, musterFlagCap(player ? input.playerManpowerCap(player) : Number.MAX_SAFE_INTEGER, musterTile.muster?.capLevel))
    : { best: undefined, unfundable: undefined };

  // Nothing attackable at all, or the nearest candidate is beyond the hard
  // range cap (every closer front locked/contested) — idle rather than
  // striking whatever unlocked tile happens to be reachable, however far.
  // `waiting`: a reachable target exists but the flag is still saving up for it.
  const waiting = nearest !== undefined;
  if (!best) {
    if (isHumanFlagOwner(input, playerId)) {
      // Hostile land (a barbarian, or a rival who isn't an ally) that doesn't
      // touch our border yet: close the distance by expanding toward the
      // nearest such tile -- the next search then attacks it. Skipped while a
      // reachable target is merely unaffordable (saving up): expanding costs manpower too,
      // and the status line should say that the flag needs more.
      const hostile = !waiting ? nearestHostileWithinSteps(input, musterTile, playerId) : undefined;
      if (hostile) {
        if (maybeMarchFire(input, musterTile, playerId, { target: { x: hostile.x, y: hostile.y }, expandOnly: true })) {
          markAdvanceClearing(input, originKey, playerId);
        }
        return;
      }
      // Nothing hostile left in range and nothing still fighting: the order
      // is done -- but only if it ever had something to do (see
      // MusterState.clearing), so a flag parked at a quiet front keeps waiting.
      if (musterTile.muster?.clearing && inFlightLocks.length === 0 && !waiting) {
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
      insufficientManpower: waiting,
      noTargetInRange: !waiting,
      unfundableTarget: unfundable
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
    fightY: nearestEnemy.y,
    unfundableTarget: unfundable
  });

  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-advance",
    playerId,
    simulationTileKey(nearestEnemy.x, nearestEnemy.y),
    input.nowMs
  );
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
  if (result.accepted) markAdvanceClearing(input, originKey, playerId);
  else input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
};
