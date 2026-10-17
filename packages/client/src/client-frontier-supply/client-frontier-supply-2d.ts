import type { FrontierSupplyModel } from "./client-frontier-supply.js";
import {
  SUPPLY_CHOKEPOINT_COLOR,
  supplyChevronAlpha,
  supplyChevronEdgeFade,
  supplyChokepointPulse,
  supplyFlowFraction
} from "./client-frontier-supply-style.js";

/**
 * 2D canvas renderer for frontier supply lines (the 3D counterpart is
 * client-map-3d-frontier-supply-overlay.ts). Drawn as one pass after the
 * tile loop, so a chevron crossing a tile edge isn't painted over by the
 * next tile.
 */
export type FrontierSupply2DDeps = {
  /** Screen-space centre of a tile. */
  tileCenter: (x: number, y: number) => { sx: number; sy: number };
  /** Shortest signed step from `from` to `to` on a wrapping axis. */
  wrapDeltaX: (from: number, to: number) => number;
  wrapDeltaY: (from: number, to: number) => number;
  /** Tile size in px. */
  size: number;
  viewportWidth: number;
  viewportHeight: number;
  /** The viewer's empire colour (any canvas colour string). */
  ownerColor: string;
  nowMs: number;
};

const CULL_MARGIN_TILES = 1;

const drawChevron = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, half: number): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Narrow (about 50 degrees open), matching the 3D chevron, so it still
  // reads as an arrowhead on a diagonal hop.
  ctx.beginPath();
  ctx.moveTo(-half, -half * 0.47);
  ctx.lineTo(half, 0);
  ctx.lineTo(-half, half * 0.47);
  ctx.stroke();
  ctx.restore();
};

const isOnScreen = (sx: number, sy: number, deps: FrontierSupply2DDeps): boolean => {
  const margin = deps.size * CULL_MARGIN_TILES;
  return sx > -margin && sy > -margin && sx < deps.viewportWidth + margin && sy < deps.viewportHeight + margin;
};

export const drawFrontierSupply2D = (ctx: CanvasRenderingContext2D, model: FrontierSupplyModel, deps: FrontierSupply2DDeps): void => {
  if (model.links.length === 0 && model.chokepoints.size === 0) return;
  const { size } = deps;
  const half = Math.max(3, size * 0.2);
  // Two chevrons per hop once tiles are big enough to fit them, so the
  // stream reads as continuous instead of blinking.
  const phases = size >= 20 ? [0, 0.5] : [0];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const link of model.links) {
    const from = deps.tileCenter(link.from.x, link.from.y);
    const dx = deps.wrapDeltaX(link.from.x, link.to.x) * size;
    const dy = deps.wrapDeltaY(link.from.y, link.to.y) * size;
    if (!isOnScreen(from.sx, from.sy, deps) && !isOnScreen(from.sx + dx, from.sy + dy, deps)) continue;
    const angle = Math.atan2(dy, dx);
    const alpha = supplyChevronAlpha(link.depthBeyondReach);
    for (const phase of phases) {
      const f = supplyFlowFraction(deps.nowMs, phase);
      const x = from.sx + dx * f;
      const y = from.sy + dy * f;
      const fade = alpha * supplyChevronEdgeFade(f);
      // Dark underlay first so the chevron reads on any terrain or empire colour.
      ctx.globalAlpha = fade * 0.55;
      ctx.strokeStyle = "#0b0f16";
      ctx.lineWidth = Math.max(2.5, size * 0.12);
      drawChevron(ctx, x, y, angle, half);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = link.fragile ? SUPPLY_CHOKEPOINT_COLOR : deps.ownerColor;
      ctx.lineWidth = Math.max(1.5, size * 0.07);
      drawChevron(ctx, x, y, angle, half);
    }
  }
  const pulse = supplyChokepointPulse(deps.nowMs);
  ctx.strokeStyle = SUPPLY_CHOKEPOINT_COLOR;
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  for (const choke of model.chokepoints.values()) {
    if (!choke.pinch) continue;
    const { sx, sy } = deps.tileCenter(choke.x, choke.y);
    if (!isOnScreen(sx, sy, deps)) continue;
    // A pinched diamond: the "narrow point" in the line.
    const r = size * (0.3 + 0.06 * pulse);
    ctx.globalAlpha = 0.45 + 0.45 * pulse;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + r, sy);
    ctx.lineTo(sx, sy + r);
    ctx.lineTo(sx - r, sy);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
};
