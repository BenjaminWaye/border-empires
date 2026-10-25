// Bridges the legacy floating tile menu into the new HUD. With the flag on,
// every render of the floating menu also renders the bottom action bar and
// hides the floating menu itself. Build / Aether / ⋯ "expand" it: the full
// legacy menu then shows docked on the right on the matching tab, so nothing
// the old menu could do is lost while the new screens are built.

import type { ClientState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuTab, TileMenuView } from "../client-types.js";
import { actionBarHtml } from "./client-hud-v2-action-bar.js";
import { isHudV2Active } from "./client-hud-v2-flag.js";

export type TileDockDeps = {
  tileActionMenuEl: HTMLElement;
  isMobile: () => boolean;
  handleTileAction: (actionId: TileActionDef["id"], targetKeyOverride?: string, originKeyOverride?: string) => void;
  hideTileActionMenu: () => void;
  renderHud: () => void;
};

type DockState = {
  deps: TileDockDeps;
  state: ClientState;
  rerender: () => void;
  expandedKey: string | undefined;
  lastHtml: string;
};

let dock: DockState | undefined;

const BAR_ID = "hud-v2-tile";
const DOCKED = "hud-v2-docked";
const EXPANDED = "hud-v2-expanded";

const barEl = (): HTMLElement | null => document.getElementById(BAR_ID);

const hideBar = (): void => {
  const bar = barEl();
  if (!bar) return;
  bar.hidden = true;
  if (dock) dock.lastHtml = "";
};

const onBarClick = (event: MouseEvent): void => {
  if (!dock) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const { deps, state } = dock;
  const action = target.closest<HTMLButtonElement>("[data-hud-v2-action]");
  if (action && !action.disabled) {
    deps.handleTileAction(action.dataset.hudV2Action as TileActionDef["id"], action.dataset.targetKey, action.dataset.originKey);
    return;
  }
  const tab = target.closest<HTMLElement>("[data-hud-v2-tab]");
  if (tab) {
    dock.expandedKey = state.tileActionMenu.currentTileKey;
    state.tileActionMenu.activeTab = tab.dataset.hudV2Tab as TileMenuTab;
    state.tileActionMenu.renderSignature = "";
    dock.rerender();
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
    if (menuEl.style.display === "none") {
      hideBar();
      menuEl.classList.remove(EXPANDED);
      if (dock) dock.expandedKey = undefined;
    }
  }).observe(menuEl, { attributes: true, attributeFilter: ["style"] });
};

/** Called at the end of every floating-menu render. A no-op (and an undo) when the flag is off. */
export const dockTileActionMenuForHudV2 = (state: ClientState, view: TileMenuView, deps: TileDockDeps, rerender: () => void): void => {
  const menuEl = deps.tileActionMenuEl;
  if (!isHudV2Active(deps.isMobile)) {
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
    dock = { deps, state, rerender, expandedKey: undefined, lastHtml: "" };
  }
  dock.deps = deps;
  dock.state = state;
  dock.rerender = rerender;
  if (dock.expandedKey !== undefined && dock.expandedKey !== state.tileActionMenu.currentTileKey) dock.expandedKey = undefined;
  menuEl.classList.add(DOCKED);
  menuEl.classList.toggle(EXPANDED, dock.expandedKey !== undefined);
  const html = actionBarHtml(view);
  if (html !== dock.lastHtml) {
    bar.innerHTML = html;
    dock.lastHtml = html;
  }
  bar.hidden = false;
};
