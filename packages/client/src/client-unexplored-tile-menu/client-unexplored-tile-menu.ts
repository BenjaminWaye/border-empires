import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import { expandToAction } from "../client-tile-action-logic/client-tile-action-neutral.js";
import { buildMarchToAction } from "../client-march-attack-actions/client-march-attack-actions.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

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
// biome, or ownership. Pressing unexplored ground means "explore that way",
// not "claim exactly that tile", so the offered action is a single March To
// (buildMarchToAction): pressing it asks where to march from -- a nearby
// muster flag, or a tile of the player's land to raise a new one on
// (client-march-origin-picking/) -- and the flag scouts toward it, stopping
// short at the closest point if it turns out to be impassable. (An
// unexplored tile touching the player's land never reaches this menu -- the
// click claims it directly, client-action-flow.ts.)
//
// Until mustering unlocks (first enemy met, isMusterUnlocked) no flag can
// march, so the menu falls back to the Expand To claim chain
// (expandToAction, client-tile-action-neutral.ts) rather than leave a new
// player no way to head into the unknown. injectWaypointActions afterward
// adds Cancel Waypoint when this exact tile is already a waypoint target --
// expandToAction itself declines in that case, so the two never both offer
// an action at once.
const unexploredClaimActions = (state: ClientState, placeholder: Tile, deps: UnexploredTileMenuDeps): TileActionDef[] => {
  const march = buildMarchToAction(placeholder, state);
  if (!march.locked) return [march.action];
  const expand = expandToAction(state, placeholder, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget });
  return expand ? [expand] : [];
};

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
  // No Cancel March here even when a flag is marching to this tile: the
  // muster handlers need a Tile from state.tiles, which an unexplored tile
  // never has, so the button would silently do nothing. Cancel it from the
  // flag's own tile instead.
  const actions = unexploredClaimActions(state, placeholder, deps);
  const view: TileMenuView = {
    title: "Unexplored",
    subtitle: `(${wx}, ${wy})`,
    statusText: "Unexplored — terrain unknown",
    statusTone: "neutral",
    tabs: actions.length > 0 ? ["actions", "overview"] : ["overview"],
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
