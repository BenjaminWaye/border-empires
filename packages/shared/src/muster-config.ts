import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

// Maximum number of actions one ADVANCE/MARCH flag may have committed at
// once. A flag can launch another action as soon as the prior action starts
// its travel/claim/combat timer, while this cap prevents a single flag from
// flooding the lock table.
export const MUSTER_MAX_CONCURRENT_ACTIONS = 3;

// Longest MARCH a flag may be given, in tiles (toroidal Chebyshev distance
// from the flag to its target). Troops walking across the map take far longer
// than raising a muster flag next to the fight, and a long march also makes
// the route search expensive (it floods the map out to the flag), so a longer
// order is advice rather than a feature: raise a flag closer instead.
export const MUSTER_MARCH_MAX_DISTANCE_TILES = 15;

/** Toroidal Chebyshev distance in tiles between two points on the wrapping world. */
export const musterMarchDistanceTiles = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

/**
 * Advice shown instead of starting a march that is over the cap, or undefined
 * when the march is fine. Shared so the client (which checks first, and shows
 * it as plain advice) and the server (which enforces the cap and rejects with
 * this same text) never drift apart.
 */
export const musterMarchTooFarAdvice = (distanceTiles: number): string | undefined =>
  distanceTiles > MUSTER_MARCH_MAX_DISTANCE_TILES
    ? `That target is ${distanceTiles} tiles from this flag, and marches are limited to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles. Raise a muster flag closer to the target instead: troops take much longer to walk across the map than it takes to muster next to the fight.`
    : undefined;
