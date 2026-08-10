// Re-exports the portable A* waypoint planner from packages/shared (moved
// there so apps/simulation can run the exact same routing server-side for
// durable queue drain -- see packages/shared/src/waypoint-planner/waypoint-planner.ts
// for the algorithm). Only the ClientState-specific pieces stay here.
export {
  planWaypoint,
  isFrontierOriginCutOff,
  type WaypointAction,
  type WaypointStep,
  type WaypointBlockReason,
  type WaypointPlan,
  type WaypointPlannerDeps
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { WaypointPlan } from "@border-empires/shared";

type WaypointPushFeed = (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;

// TARGET_BARRIER only fires once a target is confirmed non-LAND (never
// guessed for still-unexplored targets) — cancel rather than stay stuck.
// Always returns false so callers can use it as their own tick result.
export const cancelWaypointOnBarrierBlock = (state: Pick<ClientState, "waypoint">, plan: WaypointPlan, target: { x: number; y: number }, pushFeed: WaypointPushFeed): false => {
  if (plan.blockReason === "TARGET_BARRIER") {
    pushFeed(`Waypoint cancelled at (${target.x}, ${target.y}) — turned out to be impassable. Got as close as possible.`, "info", "warn");
    state.waypoint.shift();
  }
  return false;
};
