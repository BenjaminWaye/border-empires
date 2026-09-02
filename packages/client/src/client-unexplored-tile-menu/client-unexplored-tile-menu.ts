import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import { expandToAction } from "../client-tile-action-logic/client-tile-action-neutral.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

export type UnexploredTileMenuDeps = {
  keyFor: (x: number, y: number) => string;
  pickOriginForTarget: (
    tx: number,
    ty: number,
    allowAdjacentToDock?: boolean,
    allowOptimisticExpandOrigin?: boolean
  ) => Tile | undefined;
  renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void;
  resetAttackPreviewState: (state: ClientState) => void;
};

// The client has no confirmed data about an unexplored tile, so the menu
// must show only its coordinates and its "unexplored" status — no terrain,
// biome, or ownership. The only offered action is claiming it, via the same
// expandToAction helper foggedTileActions/neutralTileActions use
// (client-tile-action-neutral.ts) -- adjacent-EXPAND or a waypoint chain,
// chosen automatically, same as any other neutral LAND target. Falls
// through to injectWaypointActions afterward (only) for the case where this
// exact tile is already the target of a queued/active waypoint --
// expandToAction itself declines in that case (see its own doc comment), so
// there's no risk of the two ever both offering an action at once.
export const openUnexploredTileActionMenu = (
  state: ClientState,
  wx: number,
  wy: number,
  clientX: number,
  clientY: number,
  deps: UnexploredTileMenuDeps
): void => {
  state.selected = { x: wx, y: wy };
  deps.resetAttackPreviewState(state);
  // Deliberately hardcode LAND rather than peeking at the real terrain: the
  // client should never pre-emptively refuse a claim toward an unexplored
  // tile just because it might be a mountain or sea. If it actually is one,
  // that's only discovered once real tile data arrives as the player expands
  // toward it — at which point topUpFromWaypoint cancels the waypoint on its
  // own, having gotten as close as possible.
  const placeholder: Tile = { x: wx, y: wy, terrain: "LAND", fogged: false };
  const expand = expandToAction(state, placeholder, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget });
  const view: TileMenuView = {
    title: "Unexplored",
    subtitle: `(${wx}, ${wy})`,
    statusText: "Unexplored — terrain unknown",
    statusTone: "neutral",
    tabs: expand ? ["actions", "overview"] : ["overview"],
    overviewLines: [{ html: "This tile has not been explored yet." }],
    actions: expand ? [expand] : [],
    buildings: [],
    crystal: []
  };
  injectWaypointActions(view, placeholder, state, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget });
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = deps.keyFor(wx, wy);
  state.tileActionMenu.scrollTopByTab = {};
  state.tileActionMenu.renderSignature = "";
  state.tileActionMenu.activeTab = view.tabs[0] ?? "actions";
  deps.renderTileActionMenu(view, clientX, clientY);
};
