import { EXPAND_MANPOWER_COST, wireStepsForPlan, type WaypointBlockReason } from "@border-empires/shared";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import { notifyInsufficientManpowerForFrontierClaim } from "../client-alerts/client-alerts.js";
import type { ClientState } from "../client-state/client-state.js";
import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { persistWaypointQueueForPlayer, waypointEnqueueWirePayload } from "../client-waypoint-planner/client-waypoint-persistence.js";

// Submits a plain adjacent-tile "expand here" click through the same
// durable server-side waypoint queue used by multi-hop plans and "Build
// Relay Beacon", instead of the client-local actionQueue: the server holds
// this entry and drains it even across a browser restart, whereas
// actionQueue is an in-memory array that never reaches the server until
// it's already been dispatched, so anything still waiting behind it is
// lost if the browser closes first. Also drives processActionQueue() (which
// synchronously drains this entry via topUpFromWaypoint when the queue is
// idle) and un-silences the resulting state.capture the same way the old
// enqueueTarget-based flow did -- client-queue-logic.ts's dispatch always
// defaults a neutral-target capture to silent, so this is the one carve-out
// for a manual tap that becomes the active capture immediately. Must run
// AFTER processActionQueue, not set optimistically beforehand: an earlier
// version set state.capture before draining and got it clobbered by that
// same synchronous dispatch (or misattributed to the wrong target if
// something else was already in flight). Returns undefined on success, or
// the planner's blockReason on failure -- previously this returned a plain
// boolean, so a rejected click (e.g. no path from owned territory) failed
// completely silently: no toast, no console line, nothing visibly
// different from a successful click. The caller surfaces this to the
// player now instead of swallowing it.
const WAYPOINT_BLOCK_REASON_MESSAGES: Record<WaypointBlockReason, string> = {
  NO_PATH: "No expansion path to that tile.",
  TARGET_OWN: "You already own that tile.",
  TARGET_BARRIER: "That tile turned out to be impassable.",
  TARGET_ALLIED: "That tile belongs to an ally.",
  TARGET_TRUCED: "You have a truce with that tile's owner.",
  NO_OWNED_TERRITORY: "You don't have any territory to expand from."
};

export const waypointBlockReasonMessage = (reason: WaypointBlockReason): string =>
  WAYPOINT_BLOCK_REASON_MESSAGES[reason];

export const enqueueAdjacentExpandWaypoint = (
  state: ClientState,
  x: number,
  y: number,
  keyFor: (x: number, y: number) => string,
  sendGameMessage: (payload: unknown, message?: string) => boolean,
  processActionQueue: () => boolean
): WaypointBlockReason | undefined => {
  // Mirror the caller's gold check (queueAdjacentExpandClaim,
  // client-action-flow.ts): the planner below only checks path/ownership,
  // never affordability, so without this a 0-manpower click queued a
  // waypoint successfully and only ever surfaced a quiet feed-panel line
  // once the durable queue actually got drained later
  // (pauseWaypointForManpowerIfNeeded, client-waypoint-manpower-pause.ts) --
  // easy to miss, and the click looked like it did nothing. Handled here
  // (rather than via the blockReason return + caller's generic "Frontier
  // claim blocked" warning) so the player gets the same prominent,
  // immediate "Insufficient manpower" alert the gold check already gives.
  if (state.manpower < EXPAND_MANPOWER_COST) {
    notifyInsufficientManpowerForFrontierClaim(state);
    return undefined;
  }
  const plan = planWaypoint({ x, y }, { state, keyFor, isInReach: authoritativeIsInReach(state, keyFor) });
  if (!plan.reachable) return plan.blockReason ?? "NO_PATH";
  const planId = `plan-${state.me}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plannedAt = Date.now();
  state.waypoint.push({ target: { x, y }, plan, planId, plannedAt });
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  sendGameMessage(waypointEnqueueWirePayload({ x, y }, undefined, { planId, plannedAt, steps: wireStepsForPlan(plan.steps) }));
  processActionQueue();
  if (state.capture && state.capture.target.x === x && state.capture.target.y === y) state.capture.silent = false;
  return undefined;
};
