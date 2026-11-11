// The AFC's sockets, cables and stabilizers extend across neighbouring tiles.
// Cut the 3D hill domes around them and place the whole assembly above the
// highest remaining point of its pad.
//
// Like a road (hillRoadCutMask), the AFC carves a levelled pad through the
// hill domes around it: hillShapeHeight is flattened to ground level within
// AFC_HILL_CUT_FULL_RADIUS of the AFC centre, fading back to the normal dome
// by AFC_HILL_CUT_FADE_RADIUS, so the far side of a diagonal neighbour still
// reads as a hill rising behind the complex. Purely visual: the tile stays a
// hills tile for vision/claim rules, the same way the landing already clears
// forest and flattens mountains in its 3x3 footprint.
//
// The pad offsets ride on the per-tile RoadCutDirections every hill drape
// already receives (dome mesh, tile surface Y, roads, ownership/fog/prospect
// drapes), so all of them trace the same cut surface.
import { AFC_LANDING_FOOTPRINT_RADIUS } from "@border-empires/shared";
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";
import type { FishingPadOffset } from "../client-map-3d-fishing/fishing-hill-cut.js";

/** Offset (tiles) from a hill tile's centre to an AFC centre whose pad cuts through it. */
export type AfcPadOffset = { readonly du: number; readonly dv: number };

// Bay geometry stays within 1.5 tiles. The extra 0.15 covers the vertices
// of the 0.1-tile hill mesh cells that overlap its outermost edge.
export const AFC_HILL_CUT_FULL_RADIUS = 1.65;
export const AFC_HILL_CUT_FADE_RADIUS = 1.85;
// Chebyshev tile radius the fade reaches into (a tile centred d tiles away
// spans d +- 0.5). Every hill tile in it gets the pad -- not just the 3x3
// footprint -- because the mask is one continuous function of distance from
// the AFC centre: a footprint tile cut at its outer edge must meet a dome
// outside the footprint that is cut by the same amount there, or the hill
// steps up at the shared border.
export const AFC_HILL_CUT_TILE_RADIUS = Math.ceil(AFC_HILL_CUT_FADE_RADIUS - 0.5);

/** After the dome cut, the pad and surrounding hill mesh still slope
 * between their rendered corners. Use their highest point so even the
 * far edge of a sliding bay clears the surface. */
export const createAfcPadSurfaceSampler = (
  cornerYAt: (x: number, y: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  rise: number
): ((x: number, y: number) => number) => (x, y) => {
  let highest = -Infinity;
  const radius = AFC_LANDING_FOOTPRINT_RADIUS;
  for (let dy = -radius; dy <= radius + 1; dy++) {
    for (let dx = -radius; dx <= radius + 1; dx++) {
      highest = Math.max(highest, cornerYAt(wrapX(x + dx), wrapY(y + dy)));
    }
  }
  return highest + rise;
};

/** 0..1 strength of the AFC pad cut at tile-local (u, v) (origin at the hill tile's centre). */
export const afcHillCutMask = (u: number, v: number, pads: readonly AfcPadOffset[] | undefined): number => {
  if (!pads || pads.length === 0) return 0;
  let best = 0;
  for (const pad of pads) {
    const d = Math.hypot(u - pad.du, v - pad.dv);
    if (d <= AFC_HILL_CUT_FULL_RADIUS) return 1;
    if (d >= AFC_HILL_CUT_FADE_RADIUS) continue;
    const t = 1 - (d - AFC_HILL_CUT_FULL_RADIUS) / (AFC_HILL_CUT_FADE_RADIUS - AFC_HILL_CUT_FULL_RADIUS);
    const mask = t * t * (3 - 2 * t);
    if (mask > best) best = mask;
  }
  return best;
};

export type AfcPadIndexDeps = {
  readonly tiles: Iterable<{ readonly x: number; readonly y: number; readonly afc?: unknown }>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  // An AFC the join drop is still hiding keeps its original terrain until
  // touchdown (see isInHeldAfcLandingFootprint), so it cuts nothing yet.
  readonly isAfcHiddenAt: (x: number, y: number) => boolean;
};

/**
 * Tile key -> pad offsets for every tile within AFC_HILL_CUT_TILE_RADIUS of
 * some AFC. Built once per terrain rebuild and dropped with it; at most 25
 * entries per AFC.
 */
export const buildAfcPadIndex = (deps: AfcPadIndexDeps): Map<string, AfcPadOffset[]> => {
  const index = new Map<string, AfcPadOffset[]>();
  const r = AFC_HILL_CUT_TILE_RADIUS;
  for (const tile of deps.tiles) {
    if (!tile.afc || deps.isAfcHiddenAt(tile.x, tile.y)) continue;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const key = deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy));
        // The tile sits at (dx, dy) from the AFC, so the AFC centre
        // is at (-dx, -dy) from the footprint tile's own centre.
        const pad: AfcPadOffset = { du: 0 - dx, dv: 0 - dy }; // 0 - d, not -d: no -0 for the AFC tile itself
        const pads = index.get(key);
        if (pads) pads.push(pad);
        else index.set(key, [pad]);
      }
    }
  }
  return index;
};

/**
 * The per-tile hill cut every hill drape should use: the tile's road cut
 * directions plus any AFC / fishing-site pads through it. Road *drawing* must
 * keep using the raw road lookup -- a tile with only a pad has no road.
 */
export const createHillCutLookup = (
  roadDirsAt: (x: number, y: number) => RoadCutDirections | undefined,
  afcPads: ReadonlyMap<string, readonly AfcPadOffset[]>,
  keyFor: (x: number, y: number) => string,
  fishingPads: ReadonlyMap<string, readonly FishingPadOffset[]> = new Map()
): ((x: number, y: number) => RoadCutDirections | undefined) => {
  if (afcPads.size === 0 && fishingPads.size === 0) return roadDirsAt;
  // Hill drapes query per vertex/road point, so merge each pad tile once;
  // bounded by the pad indexes (25 entries per AFC, 9 per fishing site),
  // dropped with them.
  const merged = new Map<string, RoadCutDirections>();
  return (x, y) => {
    const key = keyFor(x, y);
    const afc = afcPads.get(key);
    const fishing = fishingPads.get(key);
    if (!afc && !fishing) return roadDirsAt(x, y);
    let cut = merged.get(key);
    if (!cut) {
      cut = { ...roadDirsAt(x, y), ...(afc ? { afcPads: afc } : {}), ...(fishing ? { fishingPads: fishing } : {}) };
      merged.set(key, cut);
    }
    return cut;
  };
};
