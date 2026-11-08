// Renders and wires the Towns panel (desktop side panel + mobile sheet).
// Split out of client-hud.ts, which is over the file-line cap.

import { focusCameraOnTile } from "../client-activity-dashboard/client-activity-dashboard-center.js";
import type { ClientState } from "../client-state/client-state.js";
import { bindTownListControls, townListCardHtml } from "../client-town-list/client-town-list.js";

export type HudTownsPanelDeps = {
  root: ParentNode;
  panelEl: HTMLElement;
  rerender: () => void;
  requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  safeHtml: (label: string, fallback: string, render: () => string) => string;
  fallbackHtml: string;
};

export const renderHudTownsPanel = (state: ClientState, deps: HudTownsPanelDeps): void => {
  // The HUD re-renders on several tickers; only walk the tiles while the list is on screen.
  if (state.activePanel !== "towns") {
    if (deps.panelEl.innerHTML !== "") deps.panelEl.innerHTML = "";
    return;
  }
  deps.panelEl.innerHTML = deps.safeHtml("townListCardHtml", deps.fallbackHtml, () =>
    townListCardHtml(state.tiles.values(), state.me)
  );
  bindTownListControls(deps.root, {
    rerender: deps.rerender,
    onJump: (x, y) => {
      focusCameraOnTile(state, x, y, { wrapX: deps.wrapX, wrapY: deps.wrapY, requestViewRefresh: () => deps.requestViewRefresh(2, true) });
      deps.rerender();
    }
  });
};
