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

/**
 * Integrity (0-100%) below which the economy/growth multipliers drop under 1x
 * -- the midpoint of integrityEconomyMult/integrityGrowthMult's ranges. The
 * HUD only surfaces integrity (top-bar chip + warning) below this.
 */
export const INTEGRITY_PENALTY_PCT = 50;

const lerpByIntegrity = (t: number, min: number, max: number): number => min + t * (max - min);

// Lowest integrity a new empire can show at `settledTiles` (empireIntegrity passes all owned land tiles): flat at the grace
// floor up to the grace tile count, then fading linearly to no floor.
export const integrityGraceFloor = (settledTiles: number): number => {
  const over = Math.max(0, settledTiles - INTEGRITY_GRACE_TILES);
  return INTEGRITY_GRACE_FLOOR * Math.max(0, 1 - over / INTEGRITY_GRACE_FADE_TILES);
};

/**
 * Integrity is two parts (owner rule, Playtest Run 4 follow-up), each 0-1:
 *   - shape: all owned land (garrisoned and frontier) scored on its open sides -- sides facing land the player
 *     doesn't own; water and mountains block (defensibilityScore). Clean-room take on the interior-vs-perimeter
 *     idea of War of Conquest's geographic efficiency; no code copied.
 *   - garrison share: garrisoned tiles over all owned tiles.
 * Integrity is INTEGRITY_SHAPE_WEIGHT of the shape plus the rest of the garrison share.
 */
export const INTEGRITY_SHAPE_WEIGHT = 0.7;

export type IntegrityParts = { shape: number; garrisonShare: number };

export const integrityParts = (ownedTiles: number, openSides: number, garrisonedTiles: number): IntegrityParts => ({
  shape: defensibilityScore(Math.max(1, ownedTiles), openSides),
  garrisonShare: ownedTiles > 0 ? Math.max(0, Math.min(1, garrisonedTiles / ownedTiles)) : 0
});

/**
 * Integrity 0-1 from the two parts, held up by the new-empire grace floor. The floor counts all owned land: counted
 * by garrisoned tiles, an empire that never garrisoned would keep it forever.
 */
export const empireIntegrity = (ownedTiles: number, openSides: number, garrisonedTiles: number): number => {
  const parts = integrityParts(ownedTiles, openSides, garrisonedTiles);
  const score = INTEGRITY_SHAPE_WEIGHT * parts.shape + (1 - INTEGRITY_SHAPE_WEIGHT) * parts.garrisonShare;
  return Math.max(score, integrityGraceFloor(ownedTiles));
};

export const integrityEconomyMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_ECON_MIN_MULT, INTEGRITY_ECON_MAX_MULT);

export const integrityGrowthMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_GROWTH_MIN_MULT, INTEGRITY_GROWTH_MAX_MULT);
