// Fishing hill cut (true-3D renderer only). A fishing site is a flat,
// near-tile-sized apron. On a hills tile the site used to sit at the tile's
// prop height (ground + HEIGHTFIELD_HILLS_ELEVATION_BONUS) with its apron
// skirt reaching all the way back down to the ground corners -- a tall gray
// box standing on the coast. Instead, like an AFC (client-map-3d-afc-hill-cut.ts),
// the site carves a levelled pad through the hill: hillShapeHeight is
// flattened to ground level under the apron and fades back to the normal dome
// beyond it, so the site sits on the ground with only its thin apron showing.
// Purely visual: the tile stays a hills tile for every gameplay rule.
//
// The pad is one continuous function of distance from the site's centre, so
// it is registered on the 3x3 tiles around the site (a hill neighbour whose
// corridor bump reaches the shared edge is cut by the same amount there).
import { fishingSiteOffset, fishingWaterDirection } from "../client-food-tile-placement.js";

/** Offset (tiles) from a hill tile's centre to a fishing site's centre. */
export type FishingPadOffset = { readonly du: number; readonly dv: number };

// The clean apron spans the tile inset by 0.132 on every side (half-extent
// 0.368), so its corners sit ~0.52 from the site's centre. Fully flat out to
// there, fading back to the dome by FISHING_HILL_CUT_FADE_RADIUS.
export const FISHING_HILL_CUT_FULL_RADIUS = 0.53;
export const FISHING_HILL_CUT_FADE_RADIUS = 0.8;

/** 0..1 strength of the fishing pad cut at tile-local (u, v). */
export const fishingHillCutMask = (u: number, v: number, pads: readonly FishingPadOffset[] | undefined): number => {
  if (!pads || pads.length === 0) return 0;
  let best = 0;
  for (const pad of pads) {
    const d = Math.hypot(u - pad.du, v - pad.dv);
    if (d <= FISHING_HILL_CUT_FULL_RADIUS) return 1;
    if (d >= FISHING_HILL_CUT_FADE_RADIUS) continue;
    const t = 1 - (d - FISHING_HILL_CUT_FULL_RADIUS) / (FISHING_HILL_CUT_FADE_RADIUS - FISHING_HILL_CUT_FULL_RADIUS);
    const mask = t * t * (3 - 2 * t);
    if (mask > best) best = mask;
  }
  return best;
};

export type FishingPadIndexDeps = {
  readonly tiles: Iterable<{ readonly x: number; readonly y: number; readonly terrain?: string; readonly resource?: string }>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  // Same water test the fishing overlay uses to face and offset the site.
  readonly isWaterAt: (x: number, y: number) => boolean;
};

/**
 * Tile key -> fishing pad offsets for the 3x3 tiles around every FISH site
 * on a hills tile. Built once per terrain rebuild and dropped with it; at
 * most 9 entries per site.
 */
export const buildFishingPadIndex = (deps: FishingPadIndexDeps): Map<string, FishingPadOffset[]> => {
  const index = new Map<string, FishingPadOffset[]>();
  for (const tile of deps.tiles) {
    if (tile.resource !== "FISH" || tile.terrain !== "LAND" || !deps.isHillsAt(tile.x, tile.y)) continue;
    const water = fishingWaterDirection(deps.isWaterAt, tile.x, tile.y);
    const offset = fishingSiteOffset(water);
    const siteU = (water?.dx ?? 0) * offset;
    const siteV = (water?.dy ?? 0) * offset;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy));
        // The tile sits at (dx, dy) from the site's tile, so the site centre
        // is at (siteU - dx, siteV - dy) from this tile's own centre.
        const pad: FishingPadOffset = { du: siteU - dx, dv: siteV - dy };
        const pads = index.get(key);
        if (pads) pads.push(pad);
        else index.set(key, [pad]);
      }
    }
  }
  return index;
};
