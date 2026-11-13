// 2D canvas parity for the refinery map visuals (true-3D: refinery-goods-3d.ts
// and refinery-highlight-3d.ts). The supply line itself is drawn by the
// district canvas with the town's own service lines (district-canvas.ts);
// this file adds the moving loads on it and the picker's field / reach
// highlight. Called from district-canvas.ts only while the 2D map is active.
import type { DistrictPoint } from "../client-town-district/district-network.js";
import { REFINERY_GOODS_COLORS, refineryGoodsPositions } from "./refinery-goods.js";
import { REFINERY_HIGHLIGHT_COLORS, type RefineryPickerHighlight } from "./refinery-picker-highlight.js";
import type { RefinerySupplyPath } from "./refinery-scene.js";

/** Screen position of a world point: the projection of its tile's top-left corner plus the fraction inside it. */
export type WorldToScreen2D = (x: number, y: number) => { sx: number; sy: number };

const screenOf = (project: WorldToScreen2D, point: DistrictPoint, size: number): { sx: number; sy: number } => {
  const tx = Math.floor(point.x), ty = Math.floor(point.y);
  const corner = project(tx, ty);
  return { sx: corner.sx + (point.x - tx) * size, sy: corner.sy + (point.y - ty) * size };
};

/** Small crates moving from each working field to its refinery. Returns how many were drawn. */
export const drawRefineryGoods2D = (
  ctx: CanvasRenderingContext2D, paths: readonly RefinerySupplyPath[], nowMs: number, size: number, project: WorldToScreen2D
): number => {
  if (size < 10) return 0;
  const half = Math.max(2, size * 0.055);
  let drawn = 0;
  ctx.save();
  for (const path of paths) {
    ctx.fillStyle = REFINERY_GOODS_COLORS[path.resource];
    ctx.strokeStyle = "#1d1a16";
    ctx.lineWidth = Math.max(1, size * 0.012);
    for (const point of refineryGoodsPositions(path, nowMs)) {
      const { sx, sy } = screenOf(project, point, size);
      ctx.fillRect(sx - half, sy - half * 1.6, half * 2, half * 2);
      ctx.strokeRect(sx - half, sy - half * 1.6, half * 2, half * 2);
      drawn += 1;
    }
  }
  ctx.restore();
  return drawn;
};

/** The open picker's highlight: tinted tiles with an edge, strongest tone per tile. `project` gives a tile's top-left corner. */
export const drawRefineryPickerHighlight2D = (
  ctx: CanvasRenderingContext2D, highlight: RefineryPickerHighlight | undefined, size: number, project: WorldToScreen2D
): number => {
  if (!highlight || highlight.size === 0) return 0;
  ctx.save();
  for (const [key, tone] of highlight) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const { sx, sy } = project(x, y);
    const colors = REFINERY_HIGHLIGHT_COLORS[tone];
    ctx.globalAlpha = colors.alpha;
    ctx.fillStyle = colors.fill;
    ctx.fillRect(sx + 1, sy + 1, size - 2, size - 2);
    if (tone !== "reach") {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = tone === "focus" || tone === "site" ? 3 : 2;
      ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    }
  }
  ctx.restore();
  return highlight.size;
};
