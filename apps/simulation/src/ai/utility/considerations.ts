/**
 * IAUS-style response curves and the compensation formula.
 *
 * Each consideration maps a raw game value → [0, 1].
 * Multiplying considerations for a decision drives scores toward 0
 * as the consideration count grows, so scoreConsiderations applies
 * the IAUS makeup-factor compensation before returning.
 *
 * Reference: Dave Mark / IAUS (Infinite Axis Utility System)
 *   modFactor = 1 - 1/n
 *   makeUp    = (1 - product) * modFactor
 *   adjusted  = product + makeUp
 */

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Normalises x from [min, max] → [0, 1]. x < min → 0, x > max → 1. */
export const linear = (x: number, min: number, max: number): number =>
  max === min ? (x >= max ? 1 : 0) : clamp01((x - min) / (max - min));

/**
 * Logistic / sigmoid curve.
 *
 * Returns 0.5 when x === midpoint.
 * Positive steepness → rises left-to-right (higher x = higher score).
 * Negative steepness → falls left-to-right (higher x = lower score).
 */
export const logistic = (x: number, midpoint: number, steepness: number): number =>
  clamp01(1 / (1 + Math.exp(-steepness * (x - midpoint))));

/** Squared linear — accelerates slowly then steeply near max. */
export const quadratic = (x: number, min: number, max: number): number => {
  const t = linear(x, min, max);
  return t * t;
};

/**
 * Hard veto: returns 1 when the condition holds, 0 when it doesn't.
 * A single 0 in the consideration list collapses the whole product to 0,
 * so this is a true binary gate on the action.
 */
export const boolVeto = (condition: boolean): number => (condition ? 1 : 0);

/**
 * IAUS makeup-factor compensation.
 *
 * Corrects the score of a decision that already had its considerations
 * multiplied together. Without it, more considerations = systematically
 * lower scores even when every consideration is healthy (e.g. 0.9^8 = 0.43).
 */
export const compensate = (rawProduct: number, considerationCount: number): number => {
  if (considerationCount <= 1) return rawProduct;
  const modFactor = 1 - 1 / considerationCount;
  const makeUp = (1 - rawProduct) * modFactor;
  return rawProduct + makeUp;
};

/**
 * Multiply all consideration scores together, short-circuit on any 0 (veto),
 * then apply compensation.
 */
export const scoreConsiderations = (scores: readonly number[]): number => {
  if (scores.length === 0) return 0;
  let product = 1;
  for (const s of scores) {
    product *= s;
    if (product === 0) return 0;
  }
  return compensate(product, scores.length);
};
