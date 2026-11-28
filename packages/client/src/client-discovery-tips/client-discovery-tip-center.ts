// Wires "show a tip's tile" (the tutorial guide's "Show me") to the camera. Same effect as
// the Activity Feed's focus buttons (see the data-feed-focus-x handler in
// client-hud.ts): center on the tile, select it, and refresh the view.

import type { ClientState } from "../client-state/client-state.js";
import { setDiscoveryTipCenterHandler } from "./client-discovery-tip-overlay.js";
import { requestHudV2MapReveal } from "../client-hud-v2/client-hud-v2-map-reveal.js";

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
    // A Manifests screen or a phone side panel may be over the map: the HUD closes it (client-hud-v2-map-reveal.ts).
    requestHudV2MapReveal();
    requestViewRefresh();
    renderHud();
  });
};
