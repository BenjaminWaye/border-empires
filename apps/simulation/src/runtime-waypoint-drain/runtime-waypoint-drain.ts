// Server-side offline replay of the client-planned waypoint/expand queue --
// see docs/waypoint-client-planning-plan.md. Split out of
// runtime-waypoint-queue-command-handlers.ts (which was about to cross the
// repo's per-file line cap once this grew) so that file can stay focused on
// enqueue/cancel only.
//
// The client is the only planner: it computes the full route (planWaypoint,
// packages/shared/src/waypoint-planner/) and sends it as steps[] on
// WAYPOINT_ENQUEUE. This module never re-plans -- it walks the client's
// route one leg at a time, using each step's own real origin, while the
// player is offline (context.isPlayerOnline is actually "drain eligible":
// see runtime-waypoint-drain-scheduler.ts for the grace-period gate an
// online client's own topUpFromWaypoint would otherwise race).
//
// A legacy target-only entry (no `steps`, from an old client or a replayed
// command from the gateway's durable log) keeps behaving exactly as it did
// before this change: a single synthetic EXPAND/ATTACK straight at the
// target, relying on handleFrontierCommandImpl's origin fallback.
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";
import type { ServerWaypointQueueEntry } from "../player-runtime-summary.js";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";

export type RuntimeWaypointDrainContext = {
  summaryForPlayer: (playerId: string) => { waypointQueue: ServerWaypointQueueEntry[] };
  now: () => number;
  tileAt: (x: number, y: number) => DomainTileState | undefined;
  isHostileOwner: (playerId: string, targetOwnerId: string | undefined) => boolean;
  nextDrainCommandId: (playerId: string, x: number, y: number) => string;
  dispatchFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  // True while this player is eligible for server-side offline drain -- see
  // runtime-waypoint-drain-scheduler.ts's grace-period gate. Named
  // isPlayerOnline (rather than e.g. isPlayerDrainIneligible) to keep the
  // call sites' polarity identical to the pre-this-change code: a `true`
  // result still means "an active client already drives this, don't touch
  // it" -- only what makes it become `false` changed (grace period on top of
  // bare subscription).
  isPlayerOnline: (playerId: string) => boolean;
  // True while this player already has an unresolved EXPAND/ATTACK lock
  // (from a prior drain dispatch, or -- in principle -- a straggling
  // command issued just before they disconnected). The tick scheduler
  // (runtime-waypoint-drain-scheduler.ts) fires every WAYPOINT_TICK_MS
  // regardless of whether the previous leg has resolved yet
  // (FRONTIER_CLAIM_MS/COMBAT_LOCK_MS can both exceed the tick interval),
  // so without this gate the drain would launch a step whose origin is
  // still mid-claim from the *previous* step and get rejected NOT_OWNER --
  // a code that (correctly) isn't retryable, since a not-yet-owned origin
  // usually does mean something is wrong. This is the "one live dispatch
  // at a time" pacing the plan doc's §4 called for and this file didn't
  // actually implement until now.
  hasActiveLockForPlayer: (playerId: string) => boolean;
};

// Rejection codes that mean "not possible right now, but could become
// possible later without the player re-queuing" -- see the doc comment this
// carried in runtime-waypoint-queue-command-handlers.ts before the split.
export const RETRYABLE_WAYPOINT_DRAIN_CODES = new Set([
  "NOT_ADJACENT",
  "LOCKED",
  "ATTACK_COOLDOWN",
  "INSUFFICIENT_GOLD",
  "INSUFFICIENT_MANPOWER",
  "INSUFFICIENT_MUSTER",
  "SHIELDED",
  "ORIGIN_CUT_OFF"
]);

const buildDrainCommand = (
  playerId: string,
  nowMs: number,
  commandId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  actionType: FrontierCommandType
): CommandEnvelope => ({
  commandId,
  sessionId: "system-runtime:waypoint-queue",
  playerId,
  clientSeq: 0,
  issuedAt: nowMs,
  type: actionType,
  payloadJson: JSON.stringify({ fromX, fromY, toX, toY })
});

/**
 * Drain a single plan-carrying (steps[]/cursor) entry by one leg. Returns
 * "dispatched" once a live dispatch attempt has been made this call (whether
 * accepted, retryably rejected, or newly stalled) so the caller stops
 * iterating -- one live dispatch per tick per player, same pacing the
 * legacy path already used. Returns "advance" when the cursor moved forward
 * without a dispatch (a mid-route step whose target this player already
 * owns) so the caller can immediately re-evaluate the same entry. Returns
 * "done" when the whole plan completed (cursor walked past the last step)
 * or the entry was a frozen trackBarbarian plan this tick skipped entirely.
 */
const drainPlanEntry = (
  context: RuntimeWaypointDrainContext,
  playerId: string,
  entry: ServerWaypointQueueEntry
): "dispatched" | "advance" | "done" | "skip" => {
  const steps = entry.steps!;
  const cursor = entry.cursor ?? 0;
  if (cursor >= steps.length) return "done";
  // trackBarbarian plans are frozen while offline: the moving-target
  // re-target logic is client-only (findNearestBarbarian in
  // client-queue-logic.ts) and has no offline equivalent that wouldn't
  // surprise the player on reconnect -- see plan §7.
  if (entry.trackBarbarian) return "skip";
  // A stalled entry stays in the queue with its cursor intact, but the
  // server must stop touching it (plan §5) -- otherwise a genuinely dead
  // step (e.g. a permanently lost origin) gets re-dispatched every tick
  // forever instead of waiting for the client to re-plan on reconnect and
  // replace it in place.
  if (entry.stalled) return "skip";
  const step = steps[cursor]!;
  const stepTargetTile = context.tileAt(step.target.x, step.target.y);
  if (stepTargetTile && stepTargetTile.ownerId === playerId) {
    entry.cursor = cursor + 1;
    return "advance";
  }
  // Defense-in-depth alongside the hasActiveLockForPlayer gate in
  // tryDrainWaypointQueue: a step's origin can still be an in-flight
  // EXPAND/ATTACK's target (still owned by nobody, or its previous owner)
  // rather than freshly claimed by this player yet -- the lock gate should
  // already prevent this call from happening in that window, but checking
  // here too means a plan step never dispatches from an origin this player
  // doesn't actually hold and gets misclassified as a dead NOT_OWNER
  // rejection. Treated exactly like a retryable rejection: leave the
  // cursor alone, defer the entry, and let the next tick re-check once the
  // origin is actually owned.
  const originTile = context.tileAt(step.origin.x, step.origin.y);
  if (!originTile || originTile.ownerId !== playerId) {
    console.log("[waypoint-diag] drain-defer-origin-not-owned", JSON.stringify({ playerId, target: entry.target, step: cursor, origin: step.origin, originOwnerId: originTile?.ownerId }));
    return "dispatched";
  }
  const nowMs = context.now();
  const cmd = buildDrainCommand(
    playerId,
    nowMs,
    context.nextDrainCommandId(playerId, step.target.x, step.target.y),
    step.origin.x,
    step.origin.y,
    step.target.x,
    step.target.y,
    step.action
  );
  const result = context.dispatchFrontierCommand(cmd, step.action);
  console.log("[waypoint-diag] drain-dispatch-result", JSON.stringify({ playerId, target: entry.target, step: cursor, action: step.action, accepted: result.accepted, code: result.code }));
  if (result.accepted) {
    entry.cursor = cursor + 1;
    entry.stalled = false;
    return "dispatched";
  }
  if (result.code && RETRYABLE_WAYPOINT_DRAIN_CODES.has(result.code)) {
    // Leave cursor alone; next tick retries. This is the periodic-retry
    // gap closing -- a quiet offline window now gets an attempt per tick.
    return "dispatched";
  }
  // Genuinely stale: the server never invents a new route (plan §5). Mark
  // stalled and stop touching this entry until the client re-plans on
  // reconnect and replaces it in place (waypointQueueEnqueue's newer-
  // plannedAt path).
  entry.stalled = true;
  return "dispatched";
};

/**
 * Legacy single-leg drain for a target-only entry (no steps[]) -- unchanged
 * behaviour from before this branch: one synthetic EXPAND/ATTACK straight at
 * the target, origin auto-resolved server-side. See this function's own
 * former doc comment (now split across the two branches in
 * tryDrainWaypointQueue below).
 */
const drainLegacyEntry = (
  context: RuntimeWaypointDrainContext,
  playerId: string,
  entry: ServerWaypointQueueEntry
): "accepted" | "retryable" | "dead" | "defer-hostile" => {
  const target = context.tileAt(entry.target.x, entry.target.y);
  if (!target || target.ownerId === playerId) return "dead"; // gone, or already reached while queued

  const isHostile = context.isHostileOwner(playerId, target.ownerId);
  const isBarbarianTarget = target.ownerId === "barbarian-1";
  if (isHostile && !entry.trackBarbarian && !isBarbarianTarget) return "defer-hostile";
  const actionType: FrontierCommandType = isHostile ? "ATTACK" : "EXPAND";

  const nowMs = context.now();
  const cmd = buildDrainCommand(
    playerId,
    nowMs,
    context.nextDrainCommandId(playerId, entry.target.x, entry.target.y),
    entry.target.x,
    entry.target.y,
    entry.target.x,
    entry.target.y,
    actionType
  );
  const result = context.dispatchFrontierCommand(cmd, actionType);
  console.log("[waypoint-diag] drain-dispatch-result", JSON.stringify({ playerId, target: entry.target, actionType, accepted: result.accepted, code: result.code }));
  if (result.accepted) return "accepted";
  if (result.code && RETRYABLE_WAYPOINT_DRAIN_CODES.has(result.code)) return "retryable";
  return "dead";
};

/**
 * Server-side auto-drain of the waypoint/expand queue -- see this module's
 * header comment and docs/waypoint-client-planning-plan.md §4. Called from
 * the simulation tick (runtime-waypoint-drain-scheduler.ts) for every
 * drain-eligible player with a non-empty queue; the two pre-existing call
 * sites (enqueue, lock resolution) remain as harmless extra nudges.
 *
 * At most one live dispatch per call (one per tick per player) -- this is
 * what rate-matches offline progress to online progress: the leg's own
 * duration and the player's manpower/cooldown gates do the pacing, not a
 * timer.
 */
export const tryDrainWaypointQueue = (context: RuntimeWaypointDrainContext, playerId: string): void => {
  if (context.isPlayerOnline(playerId)) {
    console.log("[waypoint-diag] drain-skip-online", JSON.stringify({ playerId }));
    return;
  }
  if (context.hasActiveLockForPlayer(playerId)) {
    // Previous leg (drain-issued or otherwise) hasn't resolved yet -- wait
    // for it rather than launching a step whose origin may still be
    // mid-claim. Next tick re-checks.
    console.log("[waypoint-diag] drain-skip-locked", JSON.stringify({ playerId }));
    return;
  }
  const summary = context.summaryForPlayer(playerId);
  console.log("[waypoint-diag] drain-start", JSON.stringify({ playerId, queueLen: summary.waypointQueue.length, targets: summary.waypointQueue.map((e) => e.target) }));
  const maxAttempts = Math.min(summary.waypointQueue.length, DEV_QUEUE_SERVER_CAP);
  const deferred: ServerWaypointQueueEntry[] = [];
  const restoreDeferred = (): void => {
    if (deferred.length > 0) summary.waypointQueue = [...deferred, ...summary.waypointQueue];
  };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (summary.waypointQueue.length === 0) break;
    const entry = summary.waypointQueue[0]!;
    summary.waypointQueue = summary.waypointQueue.slice(1);

    if (entry.steps) {
      let current = entry;
      // Free cursor advances (already-owned mid-route steps) can chain
      // within the same tick; only the eventual real dispatch attempt (or
      // stall) consumes this tick's single-dispatch budget.
      for (;;) {
        const outcome = drainPlanEntry(context, playerId, current);
        if (outcome === "done") break; // plan complete -- drop
        if (outcome === "skip") {
          deferred.push(current);
          break;
        }
        if (outcome === "advance") continue; // re-evaluate same entry, next step
        // "dispatched": accepted, retryably rejected, or newly stalled.
        // Every one of those keeps the entry (unless the accepted leg was
        // the last step, handled by the next loop iteration seeing "done").
        if ((current.cursor ?? 0) >= current.steps!.length) { restoreDeferred(); return; } // completed on this dispatch -- still one dispatch this call
        deferred.push(current);
        restoreDeferred();
        return;
      }
      continue;
    }

    const outcome = drainLegacyEntry(context, playerId, entry);
    if (outcome === "accepted") {
      restoreDeferred();
      return;
    }
    if (outcome === "retryable" || outcome === "defer-hostile") {
      deferred.push(entry);
      continue;
    }
    // "dead" -- drop and keep going.
  }
  restoreDeferred();
};
