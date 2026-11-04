// Renders and wires the Towns panel (desktop side panel + mobile sheet).
// Split out of client-hud.ts, which is over the file-line cap.

import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import type { ClientState } from "../client-state/client-state.js";
import { bindTownListControls, townListCardHtml } from "../client-town-list/client-town-list.js";

export type HudTownsPanelDeps = {
  root: ParentNode;
  panelEl: HTMLElement;
  mobilePanelEl: HTMLElement;
  rerender: () => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  isMobile: () => boolean;
  safeHtml: (label: string, fallback: string, render: () => string) => string;
  fallbackHtml: string;
};

const townsPanelOpen = (state: ClientState, mobile: boolean): boolean =>
  mobile ? state.mobilePanel === "towns" : state.activePanel === "towns";

export const renderHudTownsPanel = (state: ClientState, deps: HudTownsPanelDeps): void => {
  // The HUD re-renders on several tickers; only walk the tiles while the list is on screen.
  if (!townsPanelOpen(state, deps.isMobile())) {
    if (deps.panelEl.innerHTML !== "") deps.panelEl.innerHTML = deps.mobilePanelEl.innerHTML = "";
    return;
  }
  deps.panelEl.innerHTML = deps.mobilePanelEl.innerHTML = deps.safeHtml("townListCardHtml", deps.fallbackHtml, () =>
    townListCardHtml(state.tiles.values(), state.me)
  );
  bindTownListControls(deps.root, {
    rerender: deps.rerender,
    onJump: (x, y) => {
      // On mobile the sheet covers the map, so close it to show the town.
      if (deps.isMobile()) {
        state.mobilePanel = "core";
        state.activePanel = null;
      }
      focusCameraOnTile(state, x, y, { wrapX: deps.wrapX, wrapY: deps.wrapY, requestViewRefresh: () => deps.requestViewRefresh(2, true) });
      deps.rerender();
    }
  });
};
