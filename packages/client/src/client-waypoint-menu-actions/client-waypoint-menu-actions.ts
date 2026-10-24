import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import type { WaypointPlan } from "../client-waypoint-planner/client-waypoint-planner.js";

export const formatWaypointSummary = (plan: WaypointPlan): string => {
  const seconds = Math.max(1, Math.round(plan.totalDurationMs / 1000));
  const summaryParts: string[] = [];
  if (plan.expandCount > 0) summaryParts.push(`${plan.expandCount} expand`);
  if (plan.attackCount > 0) summaryParts.push(`${plan.attackCount} attack`);
  const costParts: string[] = [];
  if (plan.totalGold > 0) costParts.push(`${plan.totalGold} coin`);
  if (plan.totalManpower > 0) costParts.push(`${plan.totalManpower} manpower`);
  costParts.push(`~${seconds}s`);
  return `${summaryParts.join(" + ")} — ${costParts.join(", ")}`;
};

const prependWaypointAction = (view: TileMenuView, action: TileActionDef): void => {
  view.actions = [action, ...view.actions];
  view.tabs = ["actions", ...view.tabs.filter((tab) => tab !== "actions")];
};

// A waypoint's target tile can be off-screen or never explored (e.g. queued
// by a misclick just before signing in), leaving no way to select it and
// use "cancel_waypoint". Appending this on every tile's menu -- not just
// the waypoint's own target -- means any tile the player can currently
// select is enough to clear the whole queue. Safe to call unconditionally:
// view.actions is rebuilt fresh per render (client-tile-menu-view.ts), so
// there's nothing to de-duplicate against across renders.
const appendCancelAllWaypointsAction = (
  view: TileMenuView,
  state: Pick<ClientState, "waypoint">
): void => {
  if (state.waypoint.length === 0) return;
  view.actions.push({
    id: "cancel_all_waypoints",
    label: `Cancel All Waypoints (${state.waypoint.length})`,
    detail: "Clears your entire queued waypoint list, including any target you can't currently see."
  });
};

// Mutates view.actions/tabs to surface Cancel Waypoint when the tile is the
// current waypoint target, and appends Cancel All Waypoints whenever the
// queue is non-empty. A distant enemy tile used to get an "Expand To &
// Attack" waypoint chain here too; that's now a march from a muster flag
// (March Attack rows, client-march-attack-actions.ts), and a neutral target
// gets "Expand To" (client-tile-action-neutral.ts).
export const injectWaypointActions = (view: TileMenuView, tile: Tile, state: Pick<ClientState, "waypoint">): void => {
  // Idempotent: renderTileActionMenu fires repeatedly for the same tile
  // (initial open + HUD re-render on every server tick).
  const firstActionId = view.actions[0]?.id;
  const alreadyInjected = firstActionId === "cancel_waypoint" || firstActionId === "clear_waypoint_and_expand_here";
  const activeWaypoint = state.waypoint[0];
  if (!alreadyInjected && activeWaypoint && activeWaypoint.target.x === tile.x && activeWaypoint.target.y === tile.y) {
    prependWaypointAction(view, { id: "cancel_waypoint", label: "Cancel Waypoint", detail: formatWaypointSummary(activeWaypoint.plan) });
  }
  appendCancelAllWaypointsAction(view, state);
};
