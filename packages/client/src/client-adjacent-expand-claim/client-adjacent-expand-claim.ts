import { wireStepsForPlan } from "@border-empires/shared";
import { frontierClaimDurationMsForTile } from "../client-constants.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { persistWaypointQueueForPlayer, waypointEnqueueWirePayload } from "../client-waypoint-planner/client-waypoint-persistence.js";

// Submits a plain adjacent-tile "expand here" click through the same
// durable server-side waypoint queue used by multi-hop plans and "Build
// Relay Beacon", instead of the client-local actionQueue: the server holds
// this entry and drains it even across a browser restart, whereas
// actionQueue is an in-memory array that never reaches the server until
// it's already been dispatched, so anything still waiting behind it is lost
// if the browser closes first. Also sets an optimistic state.capture (no
// `silent` flag, since a manual tap always shows the overlay -- the caller
// is expected to have already ruled out the queued/chained-claim case that
// needs to stay silent, see client-action-flow.ts's isAlreadyQueued /
// isActiveCapture short-circuit). Returns false (no-op) if the tile isn't
// reachable from any owned tile.
export const enqueueAdjacentExpandWaypoint = (
  state: ClientState,
  x: number,
  y: number,
  keyFor: (x: number, y: number) => string,
  sendGameMessage: (payload: unknown, message?: string) => boolean
): boolean => {
  const plan = planWaypoint({ x, y }, { state, keyFor, isInReach: authoritativeIsInReach(state, keyFor) });
  if (!plan.reachable) return false;
  const planId = `plan-${state.me}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plannedAt = Date.now();
  state.waypoint.push({ target: { x, y }, plan, planId, plannedAt });
  persistWaypointQueueForPlayer(state.me, state.waypoint);
  sendGameMessage(waypointEnqueueWirePayload({ x, y }, undefined, { planId, plannedAt, steps: wireStepsForPlan(plan.steps) }));
  state.capture = { startAt: Date.now(), resolvesAt: Date.now() + frontierClaimDurationMsForTile(x, y), target: { x, y }, actionType: "EXPAND" };
  return true;
};
