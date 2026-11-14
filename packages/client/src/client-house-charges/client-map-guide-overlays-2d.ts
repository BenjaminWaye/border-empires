// 2D canvas map guidance, drawn once per frame on the 2D renderer only (the
// true-3D counterpart is client-map-3d-map-guide-overlay.ts): the shaded
// area of a focused House Charge, then the guide ring markers for both the
// onboarding guide and the focused charge (client-house-charges-map.ts).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawOnboardingChecklistHighlights } from "../client-onboarding-checklist/client-onboarding-checklist-highlight.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargeAreaEdges, houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges-map.js";

export const CHARGE_TINT_GARRISONED = "rgba(95, 211, 106, 0.5)";
/** Tiles still to take: a dark wash plus pale diagonal hatching, so they read by pattern on sand, grass or snow alike. */
export const CHARGE_TINT_OPEN = "rgba(18, 14, 8, 0.3)";
export const CHARGE_HATCH = "rgba(255, 232, 170, 0.9)";
export const CHARGE_OUTLINE = "rgba(240, 207, 130, 0.95)";

const drawHatch = (ctx: CanvasRenderingContext2D, left: number, top: number, size: number): void => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, size, size);
  ctx.clip();
  ctx.strokeStyle = CHARGE_HATCH;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.beginPath();
  for (let offset = -size; offset < size; offset += size / 3) {
    ctx.moveTo(left + offset, top + size);
    ctx.lineTo(left + offset + size, top);
  }
  ctx.stroke();
  ctx.restore();
};

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
      if (!tile.garrisoned) drawHatch(ctx, sx - size / 2, sy - size / 2, size);
    }
    // Gold outline around the whole area, so its extent reads even where garrisoned green meets grass.
    ctx.strokeStyle = CHARGE_OUTLINE;
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.beginPath();
    for (const edge of houseChargeAreaEdges(tint, WORLD_WIDTH, WORLD_HEIGHT)) {
      const { sx, sy } = deps.worldToScreen(edge.x, edge.y, size, deps.halfW, deps.halfH);
      const half = size / 2;
      const [x1, y1, x2, y2] = edge.side === "N" ? [-half, -half, half, -half] : edge.side === "S" ? [-half, half, half, half] : edge.side === "E" ? [half, -half, half, half] : [-half, -half, -half, half];
      ctx.moveTo(sx + x1, sy + y1);
      ctx.lineTo(sx + x2, sy + y2);
    }
    ctx.stroke();
    ctx.restore();
  }
  const markers = houseChargeMarkerTiles(state, WORLD_WIDTH, WORLD_HEIGHT);
  drawOnboardingChecklistHighlights(markers.length > 0 ? [...state.onboardingHighlightTiles, ...markers] : state.onboardingHighlightTiles, deps);
};
