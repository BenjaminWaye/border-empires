import type { ClientState, ClientWaypoint } from "../client-state/client-state.js";
import type { WaypointPlan } from "@border-empires/shared";

/**
 * What happens when a waypoint's next step stops making progress.
 *
 * `topUpFromWaypoint` tolerates a few ticks of the planner re-emitting the
 * same step (a FRONTIER_RESULT can land before the TILE_DELTA that flips
 * ownership), then halts. Two bugs used to live in that halt:
 *
 *  - The counter was not written back on the halting tick, so it stuck at the
 *    threshold and every later tick recomputed threshold+1 and re-pushed the
 *    "Waypoint halted" message to the feed — forever.
 *  - A halted waypoint kept the head of the queue, so every waypoint behind it
 *    was blocked with no way to make progress.
 */
export const MAX_CONSECUTIVE_WAYPOINT_RETRIES = 4;

export type WaypointHaltDeps = {
  pushFeed: (
    message: string,
    type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech",
    severity?: "info" | "success" | "warn" | "error"
  ) => void;
  persistWaypointQueue: (playerId: string, queue: readonly ClientWaypoint[]) => void;
};

/**
 * True while the waypoint's own previously-enqueued step (`stepKey`) is
 * still sitting in `actionQueue` or actively dispatching -- i.e. it simply
 * hasn't resolved yet, not that the server rejected it. Lets
 * `topUpFromWaypoint` be called on every idle tick (instead of only once
 * `actionQueue` is fully empty, which starves the waypoint behind a large
 * manually-queued frontier batch) without miscounting "still waiting" as a
 * no-progress retry.
 */
export const isWaypointStepStillPending = (
  state: Pick<ClientState, "actionQueue" | "actionInFlight" | "actionTargetKey">,
  stepKey: string
): boolean => {
  if (state.actionInFlight && state.actionTargetKey === stepKey) return true;
  return state.actionQueue.some((entry) => `${entry.x},${entry.y}` === stepKey);
};

/**
 * Records one no-progress tick for the active waypoint: bumps the retry
 * counter and, once it crosses the threshold, halts the waypoint and rotates
 * it off the head of the queue.
 */
export const registerWaypointNoProgressTick = (
  state: ClientState,
  waypoint: ClientWaypoint,
  plan: WaypointPlan,
  stepKey: string,
  deps: WaypointHaltDeps
): void => {
  const retries = (waypoint.consecutiveRetries ?? 0) + 1;
  // Always write the counter back, including on the halting tick.
  waypoint.consecutiveRetries = retries;
  if (retries <= MAX_CONSECUTIVE_WAYPOINT_RETRIES) return;
  waypoint.plan = { ...plan, reachable: false, blockReason: "NO_PATH" };
  // Announce once per blocked step. `waypoint.plan` is reassigned from
  // planWaypoint on every top-up, so it cannot carry this marker itself.
  if (waypoint.haltAnnouncedKey !== stepKey) {
    waypoint.haltAnnouncedKey = stepKey;
    deps.pushFeed(`Waypoint halted at ${stepKey}. Tap the flag to cancel.`, "info", "warn");
  }
  // Rotate a halted waypoint to the back and clear its retry bookkeeping, so
  // the waypoints behind it get a turn and this one re-plans cleanly when it
  // next reaches the head. With only one waypoint there is nothing to rotate
  // to: it stays halted and quiet, still cancellable from its flag, and never
  // re-sends (lastEnqueuedKey still matches its step).
  if (state.waypoint.length > 1) {
    delete waypoint.lastEnqueuedKey;
    waypoint.consecutiveRetries = 0;
    state.waypoint.push(state.waypoint.shift()!);
    deps.persistWaypointQueue(state.me, state.waypoint);
  }
};
