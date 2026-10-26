// Bridges the legacy floating tile menu into the new HUD. With the flag on,
// every render of the floating menu also renders the bottom action bar and
// hides the floating menu itself. Build / Aether / ⋯ "expand" it: the full
// legacy menu then shows docked on the right on the matching tab, so nothing
// the old menu could do is lost. Screens (town, battle) hook in through a
// listener; neutral land next to yours expands on the click, with no bar.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuTab, TileMenuView } from "../client-types.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { actionBarHtml, barBuildings, selectBarButtons, type BarPanel } from "./client-hud-v2-action-bar.js";
import { buildListHtml, buildPlaceHtml } from "./client-hud-v2-build-list.js";
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
  /** Open list or sidebar for the current tile (⋯, Aether, Build); reset on a new tile. */
  panel: BarPanel | undefined;
  buildSelection: string | undefined;
  buildCategory: BuildingCategory | undefined;
};

let dock: DockState | undefined;
let listener: DockListener | undefined;
let suppressAutoExpandUntil = 0;
/** Last pointer-up on the map canvas: only a menu opened by a real map click may claim land. */
let lastMapClickAt = 0;
const MAP_CLICK_WINDOW_MS = 800;

const BAR_ID = "hud-v2-tile";
const BUILD_ID = "hud-v2-build";
const BUILDING_BODY_CLASS = "hud-v2-building";
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

const hideBuildSidebar = (): void => {
  const side = document.getElementById(BUILD_ID);
  if (side) side.hidden = true;
  document.body.classList.remove(BUILDING_BODY_CLASS);
};

const hideBar = (): void => {
  hideBuildSidebar();
  const bar = barEl();
  if (!bar) return;
  bar.hidden = true;
  if (dock) {
    dock.lastHtml = "";
    dock.panel = undefined;
  }
};

/** Writes the bar (and the build sidebar while Build is open) for the current view. */
const paintBar = (): void => {
  const bar = barEl();
  if (!dock || !bar || !dock.lastView) return;
  const view = dock.lastView;
  const html = actionBarHtml(view, dock.panel === "build" ? "build" : dock.panel);
  if (html !== dock.lastHtml) {
    bar.innerHTML = html;
    dock.lastHtml = html;
  }
  bar.hidden = false;
  const side = document.getElementById(BUILD_ID);
  if (!side) return;
  if (dock.panel !== "build") {
    hideBuildSidebar();
    return;
  }
  const key = dock.state.tileActionMenu.currentTileKey;
  const [x, y] = key.split(",");
  const primary = selectBarButtons(view).find((b) => b.kind === "action" && b.primary);
  const buildings = barBuildings(view, primary?.kind === "action" ? primary.action : undefined);
  const place = { buildings, selection: dock.buildSelection, targetKey: key, placeLabel: "Place" };
  side.innerHTML = buildListHtml({
    ...place,
    focusLabel: `(${x}, ${y})`,
    focusHighlighted: true,
    category: dock.buildCategory,
    emptyText: "Nothing to build here"
  }) + `<div class="hud-v2-build-place">${buildPlaceHtml(place)}</div>`;
  side.hidden = false;
  document.body.classList.add(BUILDING_BODY_CLASS);
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
    dock.panel = undefined;
    deps.handleTileAction(id, action.dataset.targetKey, action.dataset.originKey);
    paintBar();
    return;
  }
  const panel = target.closest<HTMLElement>("[data-hud-v2-panel]");
  if (panel) {
    const next = panel.dataset.hudV2Panel as BarPanel;
    dock.panel = dock.panel === next ? undefined : next;
    paintBar();
    return;
  }
  const pick = target.closest<HTMLElement>("[data-v2-build-pick]");
  if (pick) {
    dock.buildSelection = pick.dataset.v2BuildPick;
    paintBar();
    return;
  }
  const category = target.closest<HTMLElement>("[data-v2-build-category]");
  if (category) {
    dock.buildCategory = category.dataset.v2BuildCategory as BuildingCategory;
    dock.buildSelection = undefined;
    paintBar();
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
    // The map closes the tile menu on any mousedown outside it (client-map-input.ts); the bar and the build
    // sidebar are part of that menu.
    for (const el of [bar, document.getElementById(BUILD_ID)]) {
      el?.addEventListener("click", onBarClick);
      el?.addEventListener("mousedown", (event) => event.stopPropagation());
    }
    watchMenuVisibility(menuEl);
    // Feed/alert "Center" buttons, tips and other code also open tile menus; those must never claim land.
    document.getElementById("game")?.addEventListener("pointerup", () => { lastMapClickAt = Date.now(); }, true);
    dock = { deps, state, rerender, expandedKey: undefined, lastHtml: "", lastView: undefined, lastKey: "", panel: undefined, buildSelection: undefined, buildCategory: undefined };
  }
  dock.deps = deps;
  dock.state = state;
  dock.rerender = rerender;
  dock.lastView = view;
  const key = state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  const fresh = key !== dock.lastKey;
  dock.lastKey = key;
  if (fresh) {
    dock.panel = undefined;
    dock.buildSelection = undefined;
    dock.buildCategory = undefined;
  }
  if (dock.expandedKey !== undefined && dock.expandedKey !== state.tileActionMenu.currentTileKey) dock.expandedKey = undefined;
  menuEl.classList.add(DOCKED);
  menuEl.classList.toggle(EXPANDED, dock.expandedKey !== undefined);
  const fromMapClick = Date.now() - lastMapClickAt < MAP_CLICK_WINDOW_MS;
  if (fresh && key && fromMapClick && Date.now() > suppressAutoExpandUntil && shouldAutoExpand(state, state.tiles.get(key), view)) {
    hideBar();
    deps.handleTileAction("settle_land");
    return;
  }
  if (key && listener?.onMenuView(view, key)) {
    hideBar();
    return;
  }
  paintBar();
};
