import {
  INTEGRITY_ECON_MIN_MULT,
  INTEGRITY_ECON_MAX_MULT,
  INTEGRITY_GROWTH_MIN_MULT,
  INTEGRITY_GROWTH_MAX_MULT
} from "./config.js";
import { defensibilityScore } from "./math/math.js";

/**
 * Integrity (0-100%) below which the economy/growth multipliers drop under 1x
 * -- the midpoint of integrityEconomyMult/integrityGrowthMult's ranges. The
 * HUD only surfaces integrity (top-bar chip + warning) below this.
 */
export const INTEGRITY_PENALTY_PCT = 50;

const lerpByIntegrity = (t: number, min: number, max: number): number => min + t * (max - min);

/**
 * Integrity (owner rule, Playtest Run 4 follow-up) is the shape of all owned land (garrisoned and frontier): its
 * open sides -- sides facing land the player doesn't own; water and mountains block -- against the fewest an
 * empire that size could have (defensibilityScore). Clean-room take on the interior-vs-perimeter idea of War of
 * Conquest's geographic efficiency; no code copied. Holding too little of it garrisoned costs a penalty: below
 * INTEGRITY_MIN_GARRISON_SHARE garrisoned it grows to INTEGRITY_UNGARRISONED_PENALTY at none. A new player owns
 * only a garrisoned AFC, so starts at 100%.
 */
export const INTEGRITY_MIN_GARRISON_SHARE = 0.1;
export const INTEGRITY_UNGARRISONED_PENALTY = 0.3;

export type IntegrityParts = { shape: number; garrisonShare: number; garrisonPenalty: number };

export const integrityParts = (ownedTiles: number, openSides: number, garrisonedTiles: number): IntegrityParts => {
  const garrisonShare = ownedTiles > 0 ? Math.max(0, Math.min(1, garrisonedTiles / ownedTiles)) : 0;
  const shortfall = Math.max(0, INTEGRITY_MIN_GARRISON_SHARE - garrisonShare) / INTEGRITY_MIN_GARRISON_SHARE;
  return {
    shape: defensibilityScore(Math.max(1, ownedTiles), openSides),
    garrisonShare,
    garrisonPenalty: ownedTiles > 0 ? INTEGRITY_UNGARRISONED_PENALTY * shortfall : 0
  };
};

/** Integrity 0-1: the shape, less the penalty for holding under INTEGRITY_MIN_GARRISON_SHARE garrisoned. */
export const empireIntegrity = (ownedTiles: number, openSides: number, garrisonedTiles: number): number => {
  const parts = integrityParts(ownedTiles, openSides, garrisonedTiles);
  return Math.max(0, parts.shape - parts.garrisonPenalty);
};

export const integrityEconomyMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_ECON_MIN_MULT, INTEGRITY_ECON_MAX_MULT);

export const integrityGrowthMult = (t: number): number =>
  lerpByIntegrity(t, INTEGRITY_GROWTH_MIN_MULT, INTEGRITY_GROWTH_MAX_MULT);
