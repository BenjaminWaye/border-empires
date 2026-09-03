import { planWaypoint } from "../client-waypoint-planner/client-waypoint-planner.js";
import { authoritativeIsInReach } from "../client-reach-authoritative/client-reach-authoritative.js";
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
  const costParts: string[] = [];
  if (plan.totalGold > 0) costParts.push(`${plan.totalGold} gold`);
  if (plan.totalManpower > 0) costParts.push(`${plan.totalManpower} manpower`);
  costParts.push(`~${seconds}s`);
  return `${summaryParts.join(" + ")} — ${costParts.join(", ")}`;
};

const waypointPlanForTile = (
  tile: Tile,
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint" | "serverReach" | "serverReachRevision">,
  deps: WaypointMenuDeps
): WaypointPlan | undefined => {
  if (tile.terrain !== "LAND" || tile.ownerId === state.me) return;
  // A neutral (unowned) target -- visible, fogged, or genuinely unexplored
  // alike -- is always fully handled by its own "Expand To" action instead
  // (expandToAction, client-tile-action-neutral.ts): foggedTileActions and
  // neutralTileActions both offer it via the standard single-tile menu, and
  // openUnexploredTileActionMenu calls it directly for a target the client
  // has zero data on. Offering a second, functionally identical waypoint
  // button here on top of that would be pure duplication -- this module now
  // only ever needs to fire for a genuinely enemy-owned attack target.
  if (!tile.ownerId) return;
  const adjacentOrigin =
    deps.pickOriginForTarget(tile.x, tile.y, false) ??
    deps.pickOriginForTarget(tile.x, tile.y, false, true);
  if (adjacentOrigin) return;
  const isInReach = authoritativeIsInReach(state, deps.keyFor);
  // isInReach threads into the planner so every INTERMEDIATE EXPAND step
  // along an attack chain is reach-checked too, not just the final target
  // (the final enemy-owned target itself is judged only by TARGET_OWN/
  // TARGET_ALLIED/TARGET_TRUCED inside planWaypoint, never by reach).
  const plan = planWaypoint({ x: tile.x, y: tile.y }, { state, keyFor: deps.keyFor, isInReach });
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
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint" | "serverReach" | "serverReachRevision">,
  deps: WaypointMenuDeps
): void => {
  // Idempotent: renderTileActionMenu fires repeatedly for the same
  // tile (initial open + HUD re-render on every server tick), and we
  // must not stack duplicate waypoint actions on the view each time.
  const firstActionId = view.actions[0]?.id;
  if (firstActionId === "expand_here" || firstActionId === "cancel_waypoint" || firstActionId === "clear_waypoint_and_expand_here") return;
  const activeWaypoint = state.waypoint.length > 0 ? state.waypoint[0] : undefined;
  if (activeWaypoint && activeWaypoint.target.x === tile.x && activeWaypoint.target.y === tile.y) {
    prependWaypointAction(view, { id: "cancel_waypoint", label: "Cancel Waypoint", detail: formatWaypointSummary(activeWaypoint.plan) });
    return;
  }
  // Already the destination of a later (not-yet-active) queued waypoint --
  // its progress/cancel/jump-to-front controls live on the "progress" tab
  // (queuedWaypointProgressForTile), so don't also offer this action here.
  if (state.waypoint.some((entry) => entry.target.x === tile.x && entry.target.y === tile.y)) return;
  const plan = waypointPlanForTile(tile, state, deps);
  if (!plan) return;
  // This module only ever fires for enemy-owned attack targets now -- the
  // neutral-tile case was folded into "Expand To" (client-tile-action-
  // neutral.ts). Label it accordingly instead of the old generic name.
  prependWaypointAction(view, { id: "expand_here", label: "Expand To & Attack", detail: formatWaypointSummary(plan) });
};
