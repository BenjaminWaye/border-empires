import { wireStepsForPlan } from "@border-empires/shared";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
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
// something else was already in flight). Returns false (no-op) if the tile
// isn't reachable from any owned tile.
export const enqueueAdjacentExpandWaypoint = (
  state: ClientState,
  x: number,
  y: number,
  keyFor: (x: number, y: number) => string,
  sendGameMessage: (payload: unknown, message?: string) => boolean,
  processActionQueue: () => boolean
): boolean => {
  const plan = planWaypoint({ x, y }, { state, keyFor, isInReach: authoritativeIsInReach(state, keyFor) });
  if (!plan.reachable) return false;
  const planId = `plan-${state.me}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plannedAt = Date.now();
  state.waypoint.push({ target: { x, y }, plan, planId, plannedAt });
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  sendGameMessage(waypointEnqueueWirePayload({ x, y }, undefined, { planId, plannedAt, steps: wireStepsForPlan(plan.steps) }));
  processActionQueue();
  if (state.capture && state.capture.target.x === x && state.capture.target.y === y) state.capture.silent = false;
  return true;
};
