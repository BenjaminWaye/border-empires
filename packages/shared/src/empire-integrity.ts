import {
  INTEGRITY_ECON_MIN_MULT,
  INTEGRITY_ECON_MAX_MULT,
  INTEGRITY_GROWTH_MIN_MULT,
  INTEGRITY_GROWTH_MAX_MULT,
  INTEGRITY_GRACE_FADE_TILES,
  INTEGRITY_GRACE_FLOOR,
  INTEGRITY_GRACE_TILES
} from "./config.js";
import { defensibilityScore } from "./math/math.js";

const lerpByIntegrity = (t: number, min: number, max: number): number => min + t * (max - min);

// Lowest integrity a new empire can show at `settledTiles`: flat at the grace
// floor up to the grace tile count, then fading linearly to no floor.
export const integrityGraceFloor = (settledTiles: number): number => {
  const over = Math.max(0, settledTiles - INTEGRITY_GRACE_TILES);
  return INTEGRITY_GRACE_FLOOR * Math.max(0, 1 - over / INTEGRITY_GRACE_FADE_TILES);
};

export const empireIntegrity = (Ts: number, Es: number): number =>
  Math.max(defensibilityScore(Ts, Es), integrityGraceFloor(Ts));

export const integrityEconomyMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_ECON_MIN_MULT, INTEGRITY_ECON_MAX_MULT);

export const integrityGrowthMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_GROWTH_MIN_MULT, INTEGRITY_GROWTH_MAX_MULT);
