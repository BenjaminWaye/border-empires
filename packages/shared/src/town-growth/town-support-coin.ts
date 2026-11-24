// A town's coin from its support ring (owner rule 2026-11-24, City outer ring): the base comes from the inner ring
// (Chebyshev distance 1), as for a Town; a City's (or bigger town's) tier bonus scales with how much of its outer
// ring is garrisoned. An empty outer ring earns exactly what a Town would; a full one earns the whole tier bonus.
// A City therefore never earns less than the same town did as a Town.

export type TownSupportCounts = {
  /** Garrisoned support tiles in the whole ring (inner and outer). */
  supportCurrent: number;
  /** Land support tiles in the whole ring. */
  supportMax: number;
  /** Garrisoned support tiles at Chebyshev distance 1. */
  innerCurrent: number;
  /** Land support tiles at Chebyshev distance 1. */
  innerMax: number;
};

/**
 * Multiplier on a town's base coin: inner-ring garrisoned share × (townMultiplier + tier bonus × outer-ring
 * garrisoned share). `tierMultiplier` is the town's own tier multiplier (after any biota shortfall), and
 * `townMultiplier` the Town tier's. A ring with no land counts as fully held.
 */
export const townSupportCoinMultiplier = (support: TownSupportCounts, townMultiplier: number, tierMultiplier: number): number => {
  const innerRatio = support.innerMax <= 0 ? 1 : support.innerCurrent / support.innerMax;
  const outerMax = support.supportMax - support.innerMax;
  const outerRatio = outerMax <= 0 ? 1 : (support.supportCurrent - support.innerCurrent) / outerMax;
  return innerRatio * (townMultiplier + (tierMultiplier - townMultiplier) * outerRatio);
};

/** Distance-1 tiles are the inner ring; anything further is the outer ring. */
export const isInnerSupportRing = (dx: number, dy: number): boolean => Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
