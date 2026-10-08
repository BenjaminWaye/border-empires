// 2D canvas half of the river mouth (3D: the mouth plume in
// client-map-3d-river-edge-water.ts). A river's water band stopped dead at
// the sea tile's edge; instead, each sea tile touching a river mouth corner
// draws a soft wash of river water spreading out from that corner and
// fading into the sea, so the river runs out into it.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { riverMouthCorners } from "../client-map-3d-rivers/client-map-3d-river-mouths.js";

// River water (client-map-render-river-edges.ts RIVER_WATER) mixing into the
// sea. Solid at the corner, so it covers the shore foam where the river
// crosses the coastline (the 3D foam fades out there too).
const MOUTH_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "rgba(22, 72, 96, 0.95)"],
  [0.3, "rgba(28, 82, 108, 0.8)"],
  [0.65, "rgba(40, 100, 128, 0.35)"],
  [1, "rgba(50, 112, 140, 0)"]
];
// Wash radius, as a fraction of the tile.
const MOUTH_RADIUS = 0.9;
const MIN_TILE_PX = 10;

const cornerKey = (x: number, y: number): number =>
  (((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT) * WORLD_WIDTH + (((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH);

/**
 * Draws the river mouth wash on sea tile (wx, wy)'s top face (px, py, w x h)
 * for each of its corners in `mouths` (world corner keys, z * WORLD_WIDTH + x).
 * Clipped to the tile: a neighbouring sea tile draws its own part of the
 * same circle, so the wash is continuous across them.
 */
export const drawRiverMouth2D = (
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  px: number,
  py: number,
  w: number,
  h: number,
  mouths: ReadonlySet<number> = riverMouthCorners()
): void => {
  if (w < MIN_TILE_PX || mouths.size === 0) return;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    if (!mouths.has(cornerKey(wx + cx, wy + cy))) continue;
    const x = px + cx * w;
    const y = py + cy * h;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, w * MOUTH_RADIUS);
    for (const [at, color] of MOUTH_STOPS) gradient.addColorStop(at, color);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, w, h);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(px, py, w, h);
    ctx.restore();
  }
};
