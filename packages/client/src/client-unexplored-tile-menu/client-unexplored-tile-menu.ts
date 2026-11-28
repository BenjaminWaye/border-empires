import { injectWaypointActions } from "../client-waypoint-menu-actions/client-waypoint-menu-actions.js";
import { buildExploreAction } from "../client-scout-drone/client-scout-drone-explore-action.js";
import { scoutChargeCount, scoutChargeRefillIn } from "../client-scout-drone/client-scout-drone-charge-status.js";
import { expandToAction } from "../client-tile-action-logic/client-tile-action-neutral.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

export type UnexploredTileMenuDeps = {
  keyFor: (x: number, y: number) => string;
  pickOriginForTarget: (tx: number, ty: number, allowAdjacentToDock?: boolean, allowOptimisticExpandOrigin?: boolean) => Tile | undefined;
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
// Waypoint when this exact tile is already an older waypoint target. With an active
// AFC a tap on fog opens a flight plan instead (client-scout-drone-plan.ts), so this
// menu is mostly seen by a House with no AFC.
//
// A House with no AFC (lost, awaiting a replacement: afcRecovery.requiredSince)
// has no drone to send, so Explore is shown disabled and Expand To comes back
// as the way into the unknown until an AFC lands again.
const unexploredActions = (state: ClientState, placeholder: Tile, deps: UnexploredTileMenuDeps): TileActionDef[] => {
  // No charges left (e.g. the drone is out and spent them): greyed out with the refill time, as on the AFC (player report 2026-11-26).
  const nowMs = Date.now();
  const refill = scoutChargeRefillIn(state, nowMs);
  // "Explore 3/8": the ready charges ride on the button (owner, First-15 round 1).
  const ready: TileActionDef = { ...buildExploreAction(), cost: scoutChargeCount(state, nowMs) };
  const explore = refill === undefined ? ready : { ...ready, disabled: true, disabledReason: `+1 in ${refill}` };
  if (state.afcRecovery?.requiredSince === undefined) return [explore];
  const expand = expandToAction(state, placeholder, { keyFor: deps.keyFor, pickOriginForTarget: deps.pickOriginForTarget });
  const noDrone: TileActionDef = { ...explore, disabled: true, disabledReason: "Scout drones launch from an AFC, and you have none right now" };
  return expand ? [expand, noDrone] : [noDrone];
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
  // A coordinates-only stand-in for injectWaypointActions; the client never
  // guesses the real terrain of ground it has not seen.
  const placeholder: Tile = { x: wx, y: wy, terrain: "LAND", fogged: false };
  // No Cancel March here even when a flag is marching to this tile: the
  // muster handlers need a Tile from state.tiles, which an unexplored tile
  // never has, so the button would silently do nothing. Cancel it from the
  // flag's own tile instead.
  const actions = unexploredActions(state, placeholder, deps);
  const view: TileMenuView = {
    title: "Unexplored",
    subtitle: `(${wx}, ${wy})`,
    statusText: "Unexplored — terrain unknown",
    statusTone: "neutral",
    tabs: ["actions", "overview"],
    // Details repeats why Explore is greyed, so the reason is there even where the bar shows none.
    overviewLines: [
      { html: "This tile has not been explored yet." },
      ...actions.flatMap((a) => (a.id === "explore_scout" && a.disabled && a.disabledReason ? [{ html: `${a.disabledReason}.` }] : []))
    ],
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
