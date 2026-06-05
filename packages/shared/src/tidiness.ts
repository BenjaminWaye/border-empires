import {
  TIDINESS_ECON_MIN_MULT,
  TIDINESS_ECON_MAX_MULT,
  TIDINESS_GROWTH_MIN_MULT,
  TIDINESS_GROWTH_MAX_MULT
} from "./config.js";
import { defensibilityScore } from "./math.js";

/**
 * Tidiness ∈ [0,1] from a player's SETTLED metrics.
 * Ts = settled tile count, Es = exposed edges among settled tiles.
 * Delegates to defensibilityScore — reaches ~1.0 when the settled block is
 * solid (sea/mountain-backed borders, minimal exposed perimeter).
 */
export const tidinessScore = (settledTiles: number, settledExposed: number): number =>
  defensibilityScore(settledTiles, settledExposed);

const lerpByTidiness = (t: number, min: number, max: number): number =>
  min + (max - min) * Math.max(0, Math.min(1, t));

/**
 * Economy multiplier (town gold + strategic resources) from tidiness t ∈ [0,1].
 * Spans [TIDINESS_ECON_MIN_MULT, TIDINESS_ECON_MAX_MULT] — below/above 1.0 so
 * typical tidiness (~0.5) ≈ neutral, redistributing rather than inflating.
 */
export const tidinessEconomyMult = (t: number): number =>
  lerpByTidiness(t, TIDINESS_ECON_MIN_MULT, TIDINESS_ECON_MAX_MULT);

/**
 * Growth multiplier from tidiness t ∈ [0,1].
 * Deliberately gentle — growth already stacks LONG_PEACE_GROWTH_MULT ×
 * firstThreeTowns mult; this is a 4th multiplier, kept light.
 */
export const tidinessGrowthMult = (t: number): number =>
  lerpByTidiness(t, TIDINESS_GROWTH_MIN_MULT, TIDINESS_GROWTH_MAX_MULT);
