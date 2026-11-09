// Which tiles of the name decal's canvas can carry lettering at all.
//
// The decal's ground mesh used to cover the whole camera window, and every
// hill tile in it gets a 10x10 grid sampling the dome per vertex. Names cover
// a small fraction of the window, so most of that mesh carried a fully
// transparent texture -- yet it was rebuilt on every terrain rebuild: 888ms
// of a 12.9s zoomed-out pan trace (~42ms per rebuild). Only tiles inside some
// label's conservative ink rectangle are meshed now.
//
// Match drawNameAlongPath's projected tile scale. Its run fits the projected
// span, so only the excess over the path length can extend past the path's
// bounding box (half on each end). The glyph reach and margin cover rotation
// and the stroke halo.

import type { NameLabelPath } from "../client-map-name-labels/client-map-name-label-draw.js";

const GLYPH_REACH = 1.5;
const MARGIN_TILES = 1;

export type InkMaskArea = { readonly x0: number; readonly y0: number; readonly widthTiles: number; readonly heightTiles: number };
export type InkMaskLabel = { readonly kind: "player" | "island"; readonly path: NameLabelPath };

export type InkMask = {
  /** Changes whenever the covered tiles do; part of the decal's mesh key. */
  readonly key: string;
  /** Area-local tile (0..widthTiles-1, 0..heightTiles-1); false outside the area. */
  readonly covers: (tx: number, ty: number) => boolean;
};

const toroidDelta = (from: number, to: number, size: number): number => {
  let delta = (to - from) % size;
  if (delta > size / 2) delta -= size;
  if (delta < -size / 2) delta += size;
  return delta;
};

export const labelInkMask = (
  labels: readonly InkMaskLabel[],
  area: InkMaskArea,
  worldWidth: number,
  worldHeight: number,
  maxFontTiles: (kind: InkMaskLabel["kind"]) => number
): InkMask => {
  const { widthTiles, heightTiles } = area;
  const cells = new Uint8Array(Math.max(0, widthTiles * heightTiles));
  const rects: string[] = [];
  for (const { kind, path } of labels) {
    if (path.points.length === 0) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let worldLength = 0;
    let projectedLength = 0;
    let previousX = 0;
    let previousY = 0;
    for (const [index, point] of path.points.entries()) {
      // Same projection as the decal's canvas: tile centres sit at +0.5.
      const x = toroidDelta(area.x0, point.x, worldWidth) + 0.5;
      const y = toroidDelta(area.y0, point.y, worldHeight) + 0.5;
      const previous = path.points[index - 1];
      if (previous) {
        worldLength += Math.hypot(point.x - previous.x, point.y - previous.y);
        projectedLength += Math.hypot(x - previousX, y - previousY);
      }
      previousX = x;
      previousY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // The shortest-delta projection can stretch a path across the wrap cut.
    const projectedScale = projectedLength / Math.max(0.5, worldLength);
    const overshoot = Math.max(0, path.spanTiles * projectedScale - projectedLength) / 2;
    const glyphHeight = Math.min(Math.max(0, path.heightTiles * projectedScale), maxFontTiles(kind));
    const pad = overshoot + GLYPH_REACH * glyphHeight + MARGIN_TILES;
    const x0 = Math.max(0, Math.floor(minX - pad));
    const x1 = Math.min(widthTiles - 1, Math.ceil(maxX + pad));
    const y0 = Math.max(0, Math.floor(minY - pad));
    const y1 = Math.min(heightTiles - 1, Math.ceil(maxY + pad));
    if (x0 > x1 || y0 > y1) continue;
    rects.push(`${x0},${y0},${x1},${y1}`);
    for (let ty = y0; ty <= y1; ty += 1) cells.fill(1, ty * widthTiles + x0, ty * widthTiles + x1 + 1);
  }
  return {
    key: rects.join(";"),
    covers: (tx, ty) => tx >= 0 && ty >= 0 && tx < widthTiles && ty < heightTiles && cells[ty * widthTiles + tx] === 1
  };
};
