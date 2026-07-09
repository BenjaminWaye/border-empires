import type { Tile } from "../client-types.js";
import type { ExposedBorderSides } from "../client-map-render/client-map-render.js";

// Deterministic pseudo-random jitter seeded by tile coordinates + side +
// segment index (classic GLSL-style hash). This keeps each tile's torn
// silhouette stable frame-to-frame (no flicker) while still varying from
// tile to tile, without needing to store any RNG state.
const tornHash = (a: number, b: number, c: number, d: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 269.5) * 43758.5453;
  return h - Math.floor(h);
};

const TORN_SEGMENTS = 5;

// Traces one edge of the tile as a jagged polyline instead of a straight
// line, giving the "ripped sheet of paper" silhouette used for Breakthrough
// Momentum's breach overlay.
const traceTornEdge = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seedX: number,
  seedY: number,
  side: number,
  depth: number
): void => {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / length;
  const ny = (x2 - x1) / length;
  ctx.moveTo(x1, y1);
  for (let i = 1; i < TORN_SEGMENTS; i += 1) {
    const t = i / TORN_SEGMENTS;
    const jitter = (tornHash(seedX, seedY, side, i) - 0.5) * 2 * depth;
    ctx.lineTo(x1 + (x2 - x1) * t + nx * jitter, y1 + (y2 - y1) * t + ny * jitter);
  }
  ctx.lineTo(x2, y2);
};

/**
 * Draws a jagged, torn-paper-style border overlay on the edge(s) of a tile
 * that are currently missing a friendly neighbour (see `exposedBorderSides`
 * in client-map-render.ts) while the tile is inside its Breakthrough
 * Momentum breach window (see BREAKTHROUGH_DEBUFF_MULT / BREAKTHROUGH_DURATION_MS
 * in @border-empires/shared) — a visual cue that the tile's defence is
 * temporarily weakened after that neighbour was just captured. Only the
 * exposed side(s) get the torn treatment; sides still held by a friendly
 * tile are left to the normal solid ownership border.
 */
export const drawBreachTornBorder = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y">,
  px: number,
  py: number,
  size: number,
  sides: ExposedBorderSides
): void => {
  if (!sides.top && !sides.right && !sides.bottom && !sides.left) return;
  const x1 = px + 2;
  const y1 = py + 2;
  const x2 = px + size - 2;
  const y2 = py + size - 2;
  const depth = Math.max(1.2, Math.min(3.5, size * 0.08));
  const pulse = 0.5 + 0.22 * Math.sin(Date.now() / 420);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 176, 59, ${pulse.toFixed(3)})`;
  ctx.lineWidth = Math.max(1.4, Math.min(2.4, size * 0.05));
  ctx.beginPath();
  if (sides.top) traceTornEdge(ctx, x1, y1, x2, y1, tile.x, tile.y, 0, depth);
  if (sides.right) traceTornEdge(ctx, x2, y1, x2, y2, tile.x, tile.y, 1, depth);
  if (sides.bottom) traceTornEdge(ctx, x2, y2, x1, y2, tile.x, tile.y, 2, depth);
  if (sides.left) traceTornEdge(ctx, x1, y2, x1, y1, tile.x, tile.y, 3, depth);
  ctx.stroke();
  ctx.restore();
};
