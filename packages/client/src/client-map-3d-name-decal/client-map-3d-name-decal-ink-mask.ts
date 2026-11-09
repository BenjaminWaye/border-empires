// Which tiles of the name decal's canvas can carry lettering at all.
//
// The decal's ground mesh used to cover the whole camera window, and every
// hill tile in it gets a 10x10 grid sampling the dome per vertex. Names cover
// a small fraction of the window, so most of that mesh carried a fully
// transparent texture -- yet it was rebuilt on every terrain rebuild: 888ms
// of a 12.9s zoomed-out pan trace (~42ms per rebuild). Only tiles inside some
// label's conservative ink rectangle are meshed now.
//
// The rectangle bounds what drawNameAlongPath can paint: glyphs are centred on
// the path, the run is at most spanTiles long (spacing is clamped so it never
// exceeds the span), and a name longer than its path runs on along the end
// tangents -- so every glyph centre lies within spanTiles / 2 of the path's
// bounding box. Glyphs are at most min(heightTiles, maxFontTiles) tall plus a
// stroke halo; GLYPH_REACH and the extra tile of margin cover a rotated glyph
// and its halo with room to spare.

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
    for (const point of path.points) {
      // Same projection as the decal's canvas: tile centres sit at +0.5.
      const x = toroidDelta(area.x0, point.x, worldWidth) + 0.5;
      const y = toroidDelta(area.y0, point.y, worldHeight) + 0.5;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(0, path.spanTiles) / 2 + GLYPH_REACH * Math.min(Math.max(0, path.heightTiles), maxFontTiles(kind)) + MARGIN_TILES;
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
