// Wires the discovery-tip toast's "Center" button to the camera. Same effect as
// the Activity Feed's focus buttons (see the data-feed-focus-x handler in
// client-hud.ts): center on the tile, select it, and refresh the view.

import type { ClientState } from "../client-state/client-state.js";
import { setDiscoveryTipCenterHandler } from "./client-discovery-tip-overlay.js";

export type DiscoveryTipCenterDeps = {
  state: Pick<ClientState, "camX" | "camY" | "camSubX" | "camSubY" | "selected">;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  requestViewRefresh: () => void;
  renderHud: () => void;
};

export const installDiscoveryTipCenterBinding = ({ state, wrapX, wrapY, requestViewRefresh, renderHud }: DiscoveryTipCenterDeps): void => {
  setDiscoveryTipCenterHandler(({ x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    state.camX = wrapX(x);
    state.camY = wrapY(y);
    state.camSubX = 0;
    state.camSubY = 0;
    state.selected = { x: wrapX(x), y: wrapY(y) };
    requestViewRefresh();
    renderHud();
  });
};
