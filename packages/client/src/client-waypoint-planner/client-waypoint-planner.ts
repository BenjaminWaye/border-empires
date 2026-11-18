// Re-exports the portable A* waypoint planner from packages/shared (moved
// there so apps/simulation can run the exact same routing server-side for
// durable queue drain -- see packages/shared/src/waypoint-planner/waypoint-planner.ts
// for the algorithm). Only the ClientState-specific pieces stay here.
export {
  planWaypoint,
  type WaypointPlan,
  type WaypointPlannerDeps
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { isSeaTerrain, type WaypointPlan } from "@border-empires/shared";
import { keyForTile } from "../client-app-runtime-utils.js";

type WaypointPushFeed = (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;

/** Rule reminder appended when the dead end is water. Worldgen links every island's docks into one network (server-worldgen-dock-links.ts), so this holds on every map; it never points at a dock. */
export const WATER_DEAD_END_DOCK_HINT = "Every island has a dock with a sea lane to another island.";

/** Feed text for a waypoint whose target turned out impassable. */
export const waypointBarrierNotice = (target: { x: number; y: number }, targetIsWater: boolean): string =>
  `Waypoint cancelled at (${target.x}, ${target.y}) — turned out to be impassable. Got as close as possible.${targetIsWater ? ` ${WATER_DEAD_END_DOCK_HINT}` : ""}`;

// TARGET_BARRIER only fires once a target is confirmed non-LAND (never
// guessed for still-unexplored targets) — cancel rather than stay stuck.
// Always returns false so callers can use it as their own tick result.
export const cancelWaypointOnBarrierBlock = (state: Pick<ClientState, "waypoint" | "tiles">, plan: WaypointPlan, target: { x: number; y: number }, pushFeed: WaypointPushFeed): false => {
  if (plan.blockReason === "TARGET_BARRIER") {
    const terrain = state.tiles.get(keyForTile(target.x, target.y))?.terrain;
    pushFeed(waypointBarrierNotice(target, terrain !== undefined && isSeaTerrain(terrain)), "info", "warn");
    state.waypoint.shift();
  }
  return false;
};
