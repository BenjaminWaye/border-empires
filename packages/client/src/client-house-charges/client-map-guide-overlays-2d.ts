// 2D canvas map guidance, drawn once per frame on the 2D renderer only (the
// true-3D counterpart is client-map-3d-map-guide-overlay.ts): the shaded
// area of a focused House Charge, its dotted rough circles and link
// (client-house-charges-search-guide.ts), then the guide ring markers for both
// the onboarding guide, the focused charge (client-house-charges-map.ts) and a
// clicked scout find (client-scout-finding-highlight.ts).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { drawOnboardingChecklistHighlights } from "../client-onboarding-checklist/client-onboarding-checklist-highlight.js";
import type { ClientState } from "../client-state/client-state.js";
import { houseChargeAreaEdges, houseChargeTintTiles, type ChargeMapPoint } from "./client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges-search-guide.js";
import { mapGuideRingTiles } from "./client-map-guide-ring-tiles.js";

export const CHARGE_TINT_GARRISONED = "rgba(95, 211, 106, 0.5)";
/** Tiles still to take: a dark wash plus pale diagonal hatching, so they read by pattern on sand, grass or snow alike. */
export const CHARGE_TINT_OPEN = "rgba(18, 14, 8, 0.3)";
/** A Three Metropolises landmass: a light gold wash, only to show where it is. */
export const CHARGE_TINT_PLAIN = "rgba(240, 207, 130, 0.28)";
export const CHARGE_HATCH = "rgba(255, 232, 170, 0.9)";
export const CHARGE_OUTLINE = "rgba(240, 207, 130, 0.95)";
/** Rough search circles: gold dots, the area outline's colour. The link between two towns: smaller pale dots. */
export const CHARGE_RING_DOT = CHARGE_OUTLINE;
export const CHARGE_LINK_DOT = "rgba(255, 244, 214, 0.9)";
/** Dot radii as a share of one tile. */
export const CHARGE_RING_DOT_RADIUS = 0.16;
export const CHARGE_LINK_DOT_RADIUS = 0.12;

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

const drawDots = (deps: MapGuideOverlays2dDeps, dots: readonly ChargeMapPoint[], color: string, radius: number): void => {
  if (dots.length === 0) return;
  const { ctx, size } = deps;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const dot of dots) {
    const { sx, sy } = deps.worldToScreen(dot.x, dot.y, size, deps.halfW, deps.halfH);
    const r = Math.max(1.5, size * radius);
    ctx.moveTo(sx + r, sy);
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
  }
  ctx.fill();
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
  state: Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me"> & Partial<Pick<ClientState, "scoutFindingHighlight">>,
  deps: MapGuideOverlays2dDeps
): void => {
  const tint = houseChargeTintTiles(state);
  if (tint.length > 0) {
    const { ctx, size } = deps;
    ctx.save();
    for (const tile of tint) {
      const { sx, sy } = deps.worldToScreen(tile.x, tile.y, size, deps.halfW, deps.halfH);
      ctx.fillStyle = tile.plain ? CHARGE_TINT_PLAIN : tile.garrisoned ? CHARGE_TINT_GARRISONED : CHARGE_TINT_OPEN;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      if (!tile.garrisoned && !tile.plain) drawHatch(ctx, sx - size / 2, sy - size / 2, size);
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
  const guide = houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT);
  if (guide.ringDots.length > 0 || guide.linkDots.length > 0) {
    deps.ctx.save();
    drawDots(deps, guide.linkDots, CHARGE_LINK_DOT, CHARGE_LINK_DOT_RADIUS);
    drawDots(deps, guide.ringDots, CHARGE_RING_DOT, CHARGE_RING_DOT_RADIUS);
    deps.ctx.restore();
  }
  drawOnboardingChecklistHighlights(mapGuideRingTiles(state, Date.now()), deps);
};
