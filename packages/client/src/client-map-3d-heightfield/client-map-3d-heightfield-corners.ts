// Per-corner elevation + vertex colour for the heightfield grid, extracted
// from client-map-3d-heightfield.ts (over the 500-line cap) so the corner
// categories -- unexplored / hills-or-sea only / all land / coast -- and the
// river-valley corner lookup live in one small, directly testable module.
import { coastWobbleAt } from "../client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import {
  coastCornerBeachMix,
  coastCornerDiagonalBias,
  coastCornerDiagonalElevationBias,
  coastCornerElevationWobbled,
  heightfieldTileBaseElevation,
  COAST_EDGE_Y,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS
} from "../client-map-3d-heightfield-terrain.js";

export type HeightfieldTileSample = {
  readonly elevation: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly isSea: boolean;
  readonly isExplored: boolean;
  readonly isHills: boolean;
  readonly isTundra: boolean;
  readonly forestProx: number;
};

/** Written in place (one reused object per rebuild) to keep the per-vertex loop allocation-free. */
export type HeightfieldCornerOut = { elevation: number; r: number; g: number; b: number };

/** A rendered heightfield corner's colour and shader masks (see Heightfield.cornerAttributesAt). */
export type HeightfieldCornerAttributes = { y: number; r: number; g: number; b: number; forestZone: number; tundraZone: number };

const SEA_FLOOR_FALLBACK_Y = heightfieldTileBaseElevation("SEA");
const BEACH_R = 244 / 255;
const BEACH_G = 232 / 255;
const BEACH_B = 198 / 255;

// Vertex categories so the heightfield reads as discrete tile cells:
//  - all sea: no triangle drawn (per-tile water quad covers it).
//  - all land: average only land neighbours so the tile is flat at land Y.
//  - mixed (coast): pull the corner Y down to just above water and tint
//    the vertex sandy-white so the LAND tile bevels into the water as
//    a soft beach instead of dropping off as a black cliff.
export const computeHeightfieldCorner = (
  out: HeightfieldCornerOut,
  s00: HeightfieldTileSample,
  s10: HeightfieldTileSample,
  s01: HeightfieldTileSample,
  s11: HeightfieldTileSample,
  cornerWorldX: number,
  cornerWorldZ: number
): void => {
  // Hills tiles are excluded from "land" here so a flat neighbour's corner
  // is only ever averaged against other flat land — it never rises just
  // because a hills tile touches it.
  const s00Land = s00.isExplored && !s00.isSea && !s00.isHills;
  const s10Land = s10.isExplored && !s10.isSea && !s10.isHills;
  const s01Land = s01.isExplored && !s01.isSea && !s01.isHills;
  const s11Land = s11.isExplored && !s11.isSea && !s11.isHills;
  const landCount = (s00Land ? 1 : 0) + (s10Land ? 1 : 0) + (s01Land ? 1 : 0) + (s11Land ? 1 : 0);
  const seaCount =
    (s00.isExplored && s00.isSea ? 1 : 0) +
    (s10.isExplored && s10.isSea ? 1 : 0) +
    (s01.isExplored && s01.isSea ? 1 : 0) +
    (s11.isExplored && s11.isSea ? 1 : 0);
  // Hills count as neither land nor sea above, but they ARE explored. A
  // corner deep inside a hills cluster has landCount=0 and seaCount=0 —
  // using landCount+seaCount here mistook that for "nothing explored"
  // and pinned it to the deep-sea-floor placeholder, breaking cornerYAt().
  const exploredCount =
    (s00.isExplored ? 1 : 0) + (s10.isExplored ? 1 : 0) + (s01.isExplored ? 1 : 0) + (s11.isExplored ? 1 : 0);
  if (exploredCount === 0) {
    // Nothing explored touches this corner; vertex won't be drawn, values
    // here are placeholders.
    out.elevation = SEA_FLOOR_FALLBACK_Y;
    out.r = (s00.r + s10.r + s01.r + s11.r) * 0.25;
    out.g = (s00.g + s10.g + s01.g + s11.g) * 0.25;
    out.b = (s00.b + s10.b + s01.b + s11.b) * 0.25;
    return;
  }
  if (landCount === 0) {
    // Explored but no *flat* land (sea and/or hills only). Not drawn by any
    // triangle, but cornerYAt still reads the cache, so average the explored
    // tiles instead of a bogus sea-floor Y. Hill samples include
    // HEIGHTFIELD_HILLS_ELEVATION_BONUS but the dome's own corner fallback
    // averages the bonus-free base -- subtract it back out to match.
    let sumE = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let n = 0;
    let touchesHills = false;
    for (const s of [s00, s10, s01, s11]) {
      if (!s.isExplored) continue;
      if (s.isHills) touchesHills = true;
      sumE += s.isHills ? s.elevation - HEIGHTFIELD_HILLS_ELEVATION_BONUS : s.elevation;
      sumR += s.r;
      sumG += s.g;
      sumB += s.b;
      n += 1;
    }
    // A hills + sea corner takes the dome's own coast pin (see
    // client-map-3d-hills-corner.ts), not an average dragged down by the
    // sea floor -- otherwise every overlay anchored here via cornerYAt sits
    // up to ~0.4 under the dome and gets depth-tested away. Sea-only corners
    // (no hill) keep the plain average: nothing drapes over them.
    out.elevation = touchesHills && seaCount > 0
      ? coastCornerElevationWobbled(s00, s10, s01, s11, COAST_EDGE_Y, coastWobbleAt(cornerWorldX, cornerWorldZ))
      : sumE / n;
    out.r = sumR / n;
    out.g = sumG / n;
    out.b = sumB / n;
    return;
  }
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumE = 0;
  if (s00Land) { sumE += s00.elevation; sumR += s00.r; sumG += s00.g; sumB += s00.b; }
  if (s10Land) { sumE += s10.elevation; sumR += s10.r; sumG += s10.g; sumB += s10.b; }
  if (s01Land) { sumE += s01.elevation; sumR += s01.r; sumG += s01.g; sumB += s01.b; }
  if (s11Land) { sumE += s11.elevation; sumR += s11.r; sumG += s11.g; sumB += s11.b; }
  const inv = 1 / landCount;
  const landR = sumR * inv;
  const landG = sumG * inv;
  const landB = sumB * inv;
  if (seaCount === 0) {
    // All explored neighbours are land — flat land top, no beach.
    out.elevation = sumE * inv;
    out.r = landR;
    out.g = landG;
    out.b = landB;
    return;
  }
  // Coast corner: more (explored) sea ⇒ closer/whiter; wobble breaks it off
  // the tile lattice (see coastCornerBeachMix).
  const wobble = coastWobbleAt(cornerWorldX, cornerWorldZ);
  const beachMix = Math.min(
    1,
    Math.max(0, coastCornerBeachMix(seaCount, exploredCount, wobble) + coastCornerDiagonalBias(s00Land, s10Land, s01Land, s11Land))
  );
  out.elevation =
    coastCornerElevationWobbled(s00, s10, s01, s11, COAST_EDGE_Y, wobble) +
    coastCornerDiagonalElevationBias(s00Land, s10Land, s01Land, s11Land);
  out.r = landR * (1 - beachMix) + BEACH_R * beachMix;
  out.g = landG * (1 - beachMix) + BEACH_G * beachMix;
  out.b = landB * (1 - beachMix) + BEACH_B * beachMix;
};
