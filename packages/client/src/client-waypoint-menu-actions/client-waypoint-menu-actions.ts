import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import type { WaypointPlan } from "../client-waypoint-planner/client-waypoint-planner.js";

export type WaypointMenuDeps = {
  keyFor: (x: number, y: number) => string;
  pickOriginForTarget: (
    tx: number,
    ty: number,
    allowAdjacentToDock?: boolean,
    allowOptimisticExpandOrigin?: boolean
  ) => Tile | undefined;
};

export const formatWaypointSummary = (plan: WaypointPlan): string => {
  const seconds = Math.max(1, Math.round(plan.totalDurationMs / 1000));
  const summaryParts: string[] = [];
  if (plan.expandCount > 0) summaryParts.push(`${plan.expandCount} expand`);
  if (plan.attackCount > 0) summaryParts.push(`${plan.attackCount} attack`);
  const costParts: string[] = [`${plan.totalGold} gold`];
  if (plan.totalManpower > 0) costParts.push(`${plan.totalManpower} manpower`);
  costParts.push(`~${seconds}s`);
  return `${summaryParts.join(" + ")} — ${costParts.join(", ")}`;
};

// Mutates view.actions/tabs to surface Cancel Waypoint when the tile is
// the current waypoint target, or Expand Here when the tile is a viable
// distant target (LAND, visible, not own, not adjacent/dock-reachable,
// reachable by the planner). All other cases leave the view untouched.
export const injectWaypointActions = (
  view: TileMenuView,
  tile: Tile,
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint">,
  deps: WaypointMenuDeps
): void => {
  // Idempotent: renderTileActionMenu fires repeatedly for the same
  // tile (initial open + HUD re-render on every server tick), and we
  // must not stack duplicate waypoint actions on the view each time.
  const firstActionId = view.actions[0]?.id;
  if (firstActionId === "expand_here" || firstActionId === "cancel_waypoint" || firstActionId === "clear_waypoint_and_expand_here") return;
  const waypoint = state.waypoint;
  if (waypoint && waypoint.target.x === tile.x && waypoint.target.y === tile.y) {
    view.actions = [
      { id: "cancel_waypoint", label: "Cancel Waypoint", detail: formatWaypointSummary(waypoint.plan) },
      ...view.actions
    ];
    view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
    return;
  }
  if (waypoint) {
    if (tile.terrain !== "LAND" || tile.fogged || tile.ownerId === state.me) return;
    const adjacentOrigin =
      deps.pickOriginForTarget(tile.x, tile.y, false) ??
      deps.pickOriginForTarget(tile.x, tile.y, false, true);
    if (adjacentOrigin) return;
    const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor });
    if (!plan.reachable) return;
    view.actions = [
      { id: "clear_waypoint_and_expand_here", label: "Clear Waypoint and Expand Here", detail: formatWaypointSummary(plan) },
      ...view.actions
    ];
    view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
    return;
  }
  if (tile.terrain !== "LAND" || tile.fogged || tile.ownerId === state.me) return;
  const adjacentOrigin =
    deps.pickOriginForTarget(tile.x, tile.y, false) ??
    deps.pickOriginForTarget(tile.x, tile.y, false, true);
  if (adjacentOrigin) return;
  const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor });
  if (!plan.reachable) return;
  const expandHere: TileActionDef = {
    id: "expand_here",
    label: "Expand Here",
    detail: formatWaypointSummary(plan)
  };
  view.actions = [expandHere, ...view.actions];
  view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
};
