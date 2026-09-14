// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// v1-v6: regionTypeAt (and everything downstream of it -- SAND/GRASS,
// forest, hills) was pure noise with zero dependency on where a tile sits
// on the map north-south. A desert could spawn right next to the poles, a
// rainforest-dense region right at the tundra edge -- nothing like Earth's
// actual climate bands (equatorial wet belt, ~15-35 degree subtropical
// desert belt, temperate mid-latitudes, then the existing tundra/polar
// bands). v7 adds a latitude bias to regionTypeAt's noise value before
// thresholding, using three overlapping bumps (equatorial, desert-belt,
// temperate) so those zones actually show up more often at the latitudes
// real-world climate puts them, without removing noise-driven variety
// within each band. Gated so v1-v6 (already-running seasons) reproduce
// their exact original region layout.
import { WORLD_HEIGHT } from "../config.js";

// 0 at the equator (row WORLD_HEIGHT / 2), 1 at either pole (row 0 or
// WORLD_HEIGHT). WORLD_HEIGHT wraps in y, so both edges are poles and the
// midpoint is the one equator -- matches how the existing cold-band tundra
// logic in landBiomeAt already treats distance-to-pole.
export const latitudeOf = (wy: number): number => {
  const distToEquator = Math.abs(wy - WORLD_HEIGHT / 2);
  return Math.min(1, distToEquator / (WORLD_HEIGHT / 2));
};

const gaussianBump = (latitude: number, center: number, width: number): number => {
  const d = latitude - center;
  return Math.exp(-(d * d) / (2 * width * width));
};

// Negative bias nudges regionTypeAt's v value toward FERTILE_PLAINS/
// DEEP_FOREST (lush); positive nudges toward CRYSTAL_WASTES/ANCIENT_HEARTLAND
// (arid). Three bumps, roughly matching Earth's real latitude bands scaled
// to [0, 1]: equatorial wet belt (~0-15 degrees -> 0-0.17), subtropical
// desert belt (~15-35 degrees -> 0.17-0.39, centered near the real ~25-30
// degree desert band), and temperate mid-latitudes (~35-60 degrees).
export const regionLatitudeBiasAt = (wy: number): number => {
  const latitude = latitudeOf(wy);
  return (
    -0.15 * gaussianBump(latitude, 0, 0.12) +
    0.22 * gaussianBump(latitude, 0.3, 0.13) +
    -0.09 * gaussianBump(latitude, 0.58, 0.15)
  );
};

// The equatorial wet belt -- used to scatter tropical tree overlays only
// where a real jungle/rainforest would plausibly sit, not across every
// forest tile on the map.
const TROPICAL_LATITUDE_CUTOFF = 0.2;
export const isTropicalLatitudeAt = (wy: number): boolean => latitudeOf(wy) < TROPICAL_LATITUDE_CUTOFF;
