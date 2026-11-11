import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

const MINIMAP_VIEW_PADDING_TILES = 8;
const MINIMAP_VIEW_MIN_TILES = 50;

const wrap = (value: number, size: number): number => {
  const r = value % size;
  return r < 0 ? r + size : r;
};

/**
 * The world wraps on both axes, so the minimap's frame may run past the world's edge (x0 + w > WORLD_WIDTH).
 * Returns the copy of `coord` that falls in [boxMin, boxMin + worldSize): inside the frame whenever any copy is.
 */
export const unwrapIntoBox = (coord: number, boxMin: number, worldSize: number): number => boxMin + wrap(coord - boxMin, worldSize);

/**
 * The shortest stretch of the wrapped axis covering every occupied coordinate: everything except its largest
 * empty gap. `start` is the first occupied coordinate after that gap; `span` counts from it to the last one.
 */
export const wrappedAxisExtent = (occupied: Uint8Array): { start: number; span: number } | undefined => {
  const size = occupied.length;
  let first = -1;
  for (let i = 0; i < size; i += 1) if (occupied[i]) { first = i; break; }
  if (first < 0) return undefined;
  let bestGap = -1;
  let bestStart = first;
  // Walk once around the ring from the first occupied coordinate, measuring each empty run between occupied ones.
  let prev = first;
  for (let step = 1; step <= size; step += 1) {
    const i = (first + step) % size;
    if (!occupied[i]) continue;
    const gap = step - (prev - first) - 1;
    if (gap > bestGap) {
      bestGap = gap;
      bestStart = i;
    }
    prev = first + step;
  }
  return { start: bestStart, span: size - Math.max(0, bestGap) };
};

const fitAxis = (start: number, span: number): { min: number; size: number } => {
  let min = start - MINIMAP_VIEW_PADDING_TILES;
  let size = span + MINIMAP_VIEW_PADDING_TILES * 2;
  if (size < MINIMAP_VIEW_MIN_TILES) {
    min -= (MINIMAP_VIEW_MIN_TILES - size) / 2;
    size = MINIMAP_VIEW_MIN_TILES;
  }
  return { min, size };
};

const settleAxis = (min: number, size: number, worldSize: number): { min: number; size: number } => {
  if (size >= worldSize) {
    // Keep the explored area centred; the seam then falls in the part of the world furthest from it.
    const center = min + size / 2;
    return { min: wrap(center - worldSize / 2, worldSize), size: worldSize };
  }
  return { min: wrap(min, worldSize), size };
};

/**
 * The part of the world the minimap frames: the explored tiles plus padding, matched to the canvas aspect.
 * Measured around the wrapped world, so land on both sides of the world's edge is framed together instead of
 * stretching the frame across the whole world with the land squeezed against its two sides.
 * x0/y0 are in [0, world size); x0 + w may pass the edge (see unwrapIntoBox).
 */
export const computeMiniMapViewBox = (args: {
  tiles: Map<string, Tile>;
  fogDisabled: boolean;
  canvasW: number;
  canvasH: number;
}): { x0: number; y0: number; w: number; h: number } => {
  const fullBox = { x0: 0, y0: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };
  if (args.fogDisabled || args.tiles.size === 0) return fullBox;
  const columns = new Uint8Array(WORLD_WIDTH);
  const rows = new Uint8Array(WORLD_HEIGHT);
  for (const tile of args.tiles.values()) {
    columns[wrap(Math.floor(tile.x), WORLD_WIDTH)] = 1;
    rows[wrap(Math.floor(tile.y), WORLD_HEIGHT)] = 1;
  }
  const xExtent = wrappedAxisExtent(columns);
  const yExtent = wrappedAxisExtent(rows);
  if (!xExtent || !yExtent) return fullBox;
  let { min: minX, size: boxW } = fitAxis(xExtent.start, xExtent.span);
  let { min: minY, size: boxH } = fitAxis(yExtent.start, yExtent.span);
  const canvasAspect = args.canvasW <= 0 || args.canvasH <= 0 ? 1 : args.canvasW / args.canvasH;
  const boxAspect = boxW / boxH;
  if (boxAspect < canvasAspect) {
    const target = boxH * canvasAspect;
    minX -= (target - boxW) / 2;
    boxW = target;
  } else if (boxAspect > canvasAspect) {
    const target = boxW / canvasAspect;
    minY -= (target - boxH) / 2;
    boxH = target;
  }
  const x = settleAxis(minX, boxW, WORLD_WIDTH);
  const y = settleAxis(minY, boxH, WORLD_HEIGHT);
  return { x0: x.min, y0: y.min, w: x.size, h: y.size };
};
