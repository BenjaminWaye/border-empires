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
  // tile.fogged (currently-obscured, but previously-confirmed terrain) does
  // NOT disqualify a waypoint target -- only genuinely non-LAND terrain or
  // already-owned-by-me does. Excluding fogged tiles here used to leave
  // distant fog-of-war tiles with no offered action at all.
  if (tile.terrain !== "LAND" || tile.ownerId === state.me) return;
  // A neutral (unowned) target the client already has real tile data for is
  // fully handled by Settle Land itself (client-tile-action-logic.ts): if
  // it's not adjacent, that button walks there via this exact same
  // planWaypoint/handleWaypointAction("expand_here") machinery. Offering a
  // second, functionally identical "Add Waypoint" button there would be
  // pure duplication. This does NOT apply to a genuinely unexplored target
  // (no entry in state.tiles at all) -- that case never reaches
  // menuActionsForSingleTile/Settle Land in the first place
  // (openUnexploredTileActionMenu is a separate menu whose only possible
  // action IS this one), so this module must keep offering it there.
  if (!tile.ownerId && state.tiles.has(deps.keyFor(tile.x, tile.y))) return;
  const adjacentOrigin =
    deps.pickOriginForTarget(tile.x, tile.y, false) ??
    deps.pickOriginForTarget(tile.x, tile.y, false, true);
  if (adjacentOrigin) return;
  const isInReach = authoritativeIsInReach(state, deps.keyFor);
  // NOTE: EXPAND is NOT reach-gated server-side -- a claim that lands outside
  // reach still succeeds, it just comes back stamped to decay in two minutes
  // unless the player extends reach to it (see client-tile-action-neutral.ts,
  // and the OUT_OF_REACH_EXPAND discovery tip). The early return below is a
  // narrower, purely-client-side precaution: it applies ONLY to a genuinely
  // unexplored target (no confirmed tile data at all -- a known neutral tile
  // already returned above, since Settle Land handles it instead). For an
  // unexplored tile, this module has no data on it to decide anything, so the
  // planner can't tell a legitimate multi-hop chain from a route that will
  // wander off through fog; it declines to offer the button rather than plan
  // blind. ATTACK skips this precaution entirely -- an enemy-owned target has
  // known tile data, so it's judged by the FINAL-target check below instead.
  if (!tile.ownerId && !isInReach(tile.x, tile.y)) return;
  // isInReach also threads into the planner itself so every INTERMEDIATE
  // EXPAND step along the path is reach-checked too, not just the final
  // target -- this keeps the planner from routing a multi-hop chain through
  // ground with no confirmed data of its own, even when the final
  // destination is one the caller above already knows is in reach (a
  // multi-hop chain toward an in-reach destination can still pass through
  // out-of-reach ground if the player's reach shape has a notch, e.g. two
  // separate anchors with a gap between their disks).
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
