import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
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

const waypointPlanForTile = (
  tile: Tile,
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint">,
  deps: WaypointMenuDeps
): WaypointPlan | undefined => {
  // tile.fogged (currently-obscured, but previously-confirmed terrain) does
  // NOT disqualify a waypoint target -- only genuinely non-LAND terrain or
  // already-owned-by-me does. Excluding fogged tiles here used to leave
  // distant fog-of-war tiles with no offered action at all.
  if (tile.terrain !== "LAND" || tile.ownerId === state.me) return;
  const adjacentOrigin =
    deps.pickOriginForTarget(tile.x, tile.y, false) ??
    deps.pickOriginForTarget(tile.x, tile.y, false, true);
  if (adjacentOrigin) return;
  // The planner itself is reach-blind -- it only checks that a chain of
  // plain EXPANDs can physically walk to the target, not whether the FINAL
  // claim would fall inside the fixed-border reach EXPAND actually requires
  // server-side. Without this, a tile outside the player's reach disk
  // entirely (no amount of walking closer fixes that -- it needs a new
  // beacon/outpost pushed out first) still offered "Add Waypoint", which
  // would just fail once the chain got there.
  if (!computeLocalReachSet(state.tiles, state.me).has(deps.keyFor(tile.x, tile.y))) return;
  const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor });
  return plan.reachable ? plan : undefined;
};

const prependWaypointAction = (view: TileMenuView, action: TileActionDef): void => {
  view.actions = [action, ...view.actions];
  view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
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
  const activeWaypoint = state.waypoint.length > 0 ? state.waypoint[0] : undefined;
  if (activeWaypoint && activeWaypoint.target.x === tile.x && activeWaypoint.target.y === tile.y) {
    prependWaypointAction(view, { id: "cancel_waypoint", label: `Cancel Waypoint${state.waypoint.length > 1 ? "s" : ""}`, detail: formatWaypointSummary(activeWaypoint.plan) });
    return;
  }
  // Already the destination of a later (not-yet-active) queued waypoint --
  // its progress/cancel/jump-to-front controls live on the "progress" tab
  // (queuedWaypointProgressForTile), so don't also offer "Add Waypoint" here.
  if (state.waypoint.some((entry) => entry.target.x === tile.x && entry.target.y === tile.y)) return;
  const plan = waypointPlanForTile(tile, state, deps);
  if (!plan) return;
  prependWaypointAction(view, { id: "expand_here", label: "Add Waypoint", detail: formatWaypointSummary(plan) });
};
