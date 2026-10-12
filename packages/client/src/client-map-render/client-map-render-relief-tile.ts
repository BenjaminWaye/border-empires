// The "3d-canvas" relief renderer's terrain tile (raised top + front face),
// split out of drawTerrainTile in client-map-render.ts (over the repo's
// 500-line file cap) so 2D mountain peaks could be added there.
import type { Tile } from "../client-types.js";
import { drawMountainPeaks2D } from "./client-map-render-mountain-peaks.js";
import { drawReliefMountainTile } from "./client-map-render-relief-mountain.js";
import { drawRiverEdges } from "./client-map-render-river-edges.js";
import { drawSeaCoast2D } from "./client-map-render-shore-foam.js";
import { terrainReliefPx } from "./client-map-render-terrain-relief.js";

export type ReliefTerrainTileOptions = {
  readonly wx: number;
  readonly wy: number;
  readonly terrain: Tile["terrain"];
  readonly px: number;
  readonly py: number;
  readonly size: number;
  readonly cachedTerrainColorAt: (x: number, y: number, terrain: Tile["terrain"]) => string;
};

export const drawReliefTerrainTile = (
  ctx: CanvasRenderingContext2D,
  options: ReliefTerrainTileOptions,
  texture: HTMLCanvasElement | undefined
): void => {
  const relief = terrainReliefPx(options.wx, options.wy, options.terrain, options.size);
  const topHeight = Math.max(2, options.size - relief);
  if (options.terrain === "MOUNTAIN" && options.size >= 12) {
    drawReliefMountainTile(ctx, {
      wx: options.wx,
      wy: options.wy,
      px: options.px,
      py: options.py,
      size: options.size,
      topHeight,
      relief
    });
    return;
  }
  if (texture) {
    ctx.drawImage(texture, 0, 0, texture.width, texture.height, options.px, options.py, options.size, topHeight);
    if (options.terrain === "MOUNTAIN") drawMountainPeaks2D(ctx, options.wx, options.wy, options.px, options.py, options.size);
  } else {
    ctx.fillStyle = options.cachedTerrainColorAt(options.wx, options.wy, options.terrain);
    ctx.fillRect(options.px, options.py, options.size, topHeight);
  }

  if (options.terrain === "SEA" || options.terrain === "COASTAL_SEA") {
    ctx.fillStyle = "rgba(13, 52, 80, 0.55)";
    ctx.fillRect(options.px, options.py + topHeight, options.size, relief);
    ctx.fillStyle = "rgba(173, 229, 255, 0.15)";
    ctx.fillRect(options.px + 1, options.py + 1, options.size - 2, Math.max(1, Math.floor(options.size * 0.12)));
    drawSeaCoast2D(ctx, options.wx, options.wy, options.px, options.py, options.size, topHeight);
  } else {
    ctx.fillStyle = options.terrain === "MOUNTAIN" ? "rgba(52, 55, 63, 0.9)" : "rgba(34, 42, 26, 0.65)";
    ctx.fillRect(options.px, options.py + topHeight, options.size, relief);
    ctx.fillStyle = options.terrain === "MOUNTAIN" ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(options.px + 1, options.py + 1, options.size - 2, Math.max(1, Math.floor(options.size * 0.08)));
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(options.px, options.py + topHeight - 1, options.size, 1);
    if (options.terrain === "LAND") drawRiverEdges(ctx, options.wx, options.wy, options.px, options.py, options.size, topHeight);
  }

  ctx.strokeStyle = "rgba(128, 128, 128, 0.32)";
  ctx.lineWidth = 1;
  ctx.strokeRect(options.px + 0.5, options.py + 0.5, options.size - 1, options.size - 1);
};
