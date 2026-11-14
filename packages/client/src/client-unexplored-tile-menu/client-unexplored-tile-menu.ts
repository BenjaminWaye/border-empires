import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import { buildExploreAction } from "../client-scout-drone/client-scout-drone-explore-action.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

export type UnexploredTileMenuDeps = {
  keyFor: (x: number, y: number) => string;
  renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void;
  resetAttackPreviewState: (state: ClientState) => void;
};

// The client has no confirmed data about an unexplored tile, so the menu
// must show only its coordinates and its "unexplored" status — no terrain,
// biome, or ownership. Pressing unexplored ground means "look that way",
// not "claim exactly that tile", so the one action offered is Explore
// (docs/explore-scout-plan.md): it launches the player's scout drone, which
// reveals land around itself and claims nothing. Expand To and March To are
// not offered here; once the drone has shown the ground, those work on the
// now-seen tiles as usual. injectWaypointActions afterward adds Cancel
// Waypoint when this exact tile is already an older waypoint target.
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
  // A coordinates-only stand-in for injectWaypointActions; the client never
  // guesses the real terrain of ground it has not seen.
  const placeholder: Tile = { x: wx, y: wy, terrain: "LAND", fogged: false };
  // No Cancel March here even when a flag is marching to this tile: the
  // muster handlers need a Tile from state.tiles, which an unexplored tile
  // never has, so the button would silently do nothing. Cancel it from the
  // flag's own tile instead.
  const actions = [buildExploreAction(state.scoutDroneFlight)];
  const view: TileMenuView = {
    title: "Unexplored",
    subtitle: `(${wx}, ${wy})`,
    statusText: "Unexplored — terrain unknown",
    statusTone: "neutral",
    tabs: ["actions", "overview"],
    overviewLines: [{ html: "This tile has not been explored yet." }],
    actions,
    buildings: [],
    crystal: []
  };
  injectWaypointActions(view, placeholder, state);
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.bulkKeys = [];
  state.tileActionMenu.currentTileKey = deps.keyFor(wx, wy);
  state.tileActionMenu.scrollTopByTab = {};
  state.tileActionMenu.renderSignature = "";
  state.tileActionMenu.activeTab = view.tabs[0] ?? "actions";
  deps.renderTileActionMenu(view, clientX, clientY);
};
