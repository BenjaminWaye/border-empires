// 2D canvas map guidance, drawn once per frame on the 2D renderer only (the
// true-3D counterpart is client-map-3d-map-guide-overlay.ts): the shaded
// area of a focused House Charge, then the guide ring markers for both the
// onboarding guide and the focused charge (client-house-charges-map.ts).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawOnboardingChecklistHighlights } from "../client-onboarding-checklist/client-onboarding-checklist-highlight.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges-map.js";

export const CHARGE_TINT_GARRISONED = "rgba(143, 209, 138, 0.42)";
export const CHARGE_TINT_OPEN = "rgba(240, 180, 92, 0.34)";

export type MapGuideOverlays2dDeps = {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  size: number;
  halfW: number;
  halfH: number;
  nowMs: number;
};

export const drawMapGuideOverlays = (
  state: Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me">,
  deps: MapGuideOverlays2dDeps
): void => {
  const tint = houseChargeTintTiles(state);
  if (tint.length > 0) {
    const { ctx, size } = deps;
    ctx.save();
    for (const tile of tint) {
      const { sx, sy } = deps.worldToScreen(tile.x, tile.y, size, deps.halfW, deps.halfH);
      ctx.fillStyle = tile.garrisoned ? CHARGE_TINT_GARRISONED : CHARGE_TINT_OPEN;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }
    ctx.restore();
  }
  const markers = houseChargeMarkerTiles(state, WORLD_WIDTH, WORLD_HEIGHT);
  drawOnboardingChecklistHighlights(markers.length > 0 ? [...state.onboardingHighlightTiles, ...markers] : state.onboardingHighlightTiles, deps);
};
