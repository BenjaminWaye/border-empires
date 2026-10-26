// Bridges the legacy floating tile menu into the new HUD. With the flag on,
// every render of the floating menu also renders the bottom action bar and
// hides the floating menu itself. Build / Aether / ⋯ "expand" it: the full
// legacy menu then shows docked on the right on the matching tab, so nothing
// the old menu could do is lost. Screens (town, battle) hook in through a
// listener; neutral land next to yours expands on the click, with no bar.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuTab, TileMenuView } from "../client-types.js";
import { actionBarHtml } from "./client-hud-v2-action-bar.js";
import { isHudV2Active } from "./client-hud-v2-flag.js";

export type TileDockDeps = {
  tileActionMenuEl: HTMLElement;
  isMobile: () => boolean;
  handleTileAction: (actionId: TileActionDef["id"], targetKeyOverride?: string, originKeyOverride?: string) => void;
  hideTileActionMenu: () => void;
  renderHud: () => void;
};

export type DockListener = {
  /** Return true when a screen took over this tile (the bar then stays hidden). */
  onMenuView: (view: TileMenuView, tileKey: string) => boolean;
  onMenuHidden: () => void;
  onBarAction: (actionId: TileActionDef["id"], view: TileMenuView, tileKey: string) => void;
};

type DockState = {
  deps: TileDockDeps;
  state: ClientState;
  rerender: () => void;
  expandedKey: string | undefined;
  lastHtml: string;
  lastView: TileMenuView | undefined;
  lastKey: string;
};

let dock: DockState | undefined;
let listener: DockListener | undefined;
let suppressAutoExpandUntil = 0;

const BAR_ID = "hud-v2-tile";
const DOCKED = "hud-v2-docked";
const EXPANDED = "hud-v2-expanded";

export const setDockListener = (next: DockListener): void => {
  listener = next;
};

/** Programmatic opens (Chronicle Show, town stepping) must not trigger the click-to-expand shortcut. */
export const suppressAutoExpand = (ms = 1_500): void => {
  suppressAutoExpandUntil = Date.now() + ms;
};

const barEl = (): HTMLElement | null => document.getElementById(BAR_ID);

const hideBar = (): void => {
  const bar = barEl();
  if (!bar) return;
  bar.hidden = true;
  if (dock) dock.lastHtml = "";
};

/** Shows the full legacy menu docked on the right, on `tab`. */
export const expandDockedMenu = (tab: TileMenuTab): void => {
  if (!dock) return;
  dock.expandedKey = dock.state.tileActionMenu.currentTileKey;
  dock.state.tileActionMenu.activeTab = tab;
  dock.state.tileActionMenu.renderSignature = "";
  dock.rerender();
};

const onBarClick = (event: MouseEvent): void => {
  if (!dock) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const { deps, state } = dock;
  const action = target.closest<HTMLButtonElement>("[data-hud-v2-action]");
  if (action && !action.disabled) {
    const id = action.dataset.hudV2Action as TileActionDef["id"];
    if (dock.lastView) listener?.onBarAction(id, dock.lastView, state.tileActionMenu.currentTileKey);
    deps.handleTileAction(id, action.dataset.targetKey, action.dataset.originKey);
    return;
  }
  const tab = target.closest<HTMLElement>("[data-hud-v2-tab]");
  if (tab) {
    expandDockedMenu(tab.dataset.hudV2Tab as TileMenuTab);
    return;
  }
  if (target.closest("[data-hud-v2-close]")) {
    deps.hideTileActionMenu();
    return;
  }
  const owner = target.closest<HTMLElement>("[data-player-name-id]");
  if (owner?.dataset.playerNameId) {
    state.activePlayerProfileId = owner.dataset.playerNameId;
    deps.renderHud();
  }
};

/** The floating menu hides by setting display:none; follow it so the bar never outlives its tile. */
const watchMenuVisibility = (menuEl: HTMLElement): void => {
  new MutationObserver(() => {
    if (menuEl.style.display !== "none") return;
    hideBar();
    menuEl.classList.remove(EXPANDED);
    if (dock) {
      dock.expandedKey = undefined;
      dock.lastKey = "";
    }
    listener?.onMenuHidden();
  }).observe(menuEl, { attributes: true, attributeFilter: ["style"] });
};

const NEIGHBOURS: ReadonlyArray<[number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** A plain click on neutral land touching yours claims it at once (the bar would only offer Expand To). */
export const shouldAutoExpand = (state: Pick<ClientState, "tiles" | "me">, tile: Tile | undefined, view: Pick<TileMenuView, "actions">): boolean => {
  if (!tile || tile.ownerId || tile.terrain !== "LAND" || !state.me) return false;
  const expand = view.actions.find((a) => a.id === "settle_land" && a.label === "Expand To");
  if (!expand || expand.disabled) return false;
  return NEIGHBOURS.some(([dx, dy]) => state.tiles.get(`${tile.x + dx},${tile.y + dy}`)?.ownerId === state.me);
};

/** Called at the end of every floating-menu render. A no-op (and an undo) when the flag is off. */
export const dockTileActionMenuForHudV2 = (state: ClientState, view: TileMenuView, deps: TileDockDeps, rerender: () => void): void => {
  const menuEl = deps.tileActionMenuEl;
  if (!isHudV2Active(deps.isMobile)) {
    // Flag off and never docked: leave the legacy menu completely untouched.
    if (!dock) return;
    menuEl.classList.remove(DOCKED, EXPANDED);
    hideBar();
    return;
  }
  const bar = barEl();
  if (!bar) return;
  if (!dock) {
    bar.addEventListener("click", onBarClick);
    // The map closes the tile menu on any mousedown outside it (client-map-input.ts); the bar is part of that menu.
    bar.addEventListener("mousedown", (event) => event.stopPropagation());
    watchMenuVisibility(menuEl);
    dock = { deps, state, rerender, expandedKey: undefined, lastHtml: "", lastView: undefined, lastKey: "" };
  }
  dock.deps = deps;
  dock.state = state;
  dock.rerender = rerender;
  dock.lastView = view;
  const key = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  const fresh = key !== dock.lastKey;
  dock.lastKey = key;
  if (dock.expandedKey !== undefined && dock.expandedKey !== state.tileActionMenu.currentTileKey) dock.expandedKey = undefined;
  menuEl.classList.add(DOCKED);
  menuEl.classList.toggle(EXPANDED, dock.expandedKey !== undefined);
  if (fresh && key && Date.now() > suppressAutoExpandUntil && shouldAutoExpand(state, state.tiles.get(key), view)) {
    hideBar();
    deps.handleTileAction("settle_land");
    return;
  }
  if (key && listener?.onMenuView(view, key)) {
    hideBar();
    return;
  }
  const html = actionBarHtml(view);
  if (html !== dock.lastHtml) {
    bar.innerHTML = html;
    dock.lastHtml = html;
  }
  bar.hidden = false;
};
