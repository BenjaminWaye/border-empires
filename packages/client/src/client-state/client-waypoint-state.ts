import type { WaypointPlan } from "../client-waypoint-planner/client-waypoint-planner.js";

/**
 * One entry in the client's waypoint queue, plus the anti-thrash bookkeeping
 * `topUpFromWaypoint` (client-queue-logic.ts) keeps against it.
 *
 * Extracted from client-state.ts so the fields and the reasoning behind them
 * live together — several of them exist only to stop a specific stuck-queue
 * failure mode and are meaningless without that context.
 */
export type ClientWaypoint = {
  target: { x: number; y: number };
  plan: WaypointPlan;
  // Last tile-key the waypoint asked the action queue to claim. The next
  // top-up compares the planner's new first step against it: a match means
  // ownership has not advanced (either a stale-snapshot race or a real
  // reject), so we wait a few ticks before halting.
  lastEnqueuedKey?: string;
  // Consecutive top-ups where the planner re-emitted the same step we just
  // enqueued. Resets to 0 the moment the plan advances.
  consecutiveRetries?: number;
  // Step key this waypoint has already announced a halt for. `plan` is
  // reassigned from planWaypoint on every top-up, so it cannot serve as the
  // "already told the player" marker — without this the halt message was
  // re-pushed to the feed on every single tick, forever.
  haltAnnouncedKey?: string;
  // When true, the waypoint dynamically retargets if the barbarian moves off
  // the original coordinate. Set when the destination tile is owned by
  // barbarian-1.
  trackBarbarian?: boolean;
  // Paused on an unaffordable EXPAND leg — see client-waypoint-manpower-pause.ts.
  pausedForManpower?: boolean;
};
