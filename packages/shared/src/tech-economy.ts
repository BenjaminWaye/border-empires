/**
 * Tech research gold pricing.
 *
 * Tech-tree redesign decision:
 * gold is no longer a per-tier or per-tech static number. Every tech costs
 * the SAME gold at any given moment, and each tech you have already
 * researched raises the price of every remaining tech by a flat increment.
 *
 * The increment itself escalates in tiers as more techs are researched:
 * - for the Nth tech where N < 5: +30 per tech
 * - for the Nth tech where 5 <= N < 10: +40 per tech
 * - for the Nth tech where N >= 10: +50 per tech
 *
 * e.g. 10, 40, 70, 100, 130, 170, 210, 250, 290, 330, 380, 430, ...
 *
 * Shared by the simulation (charge/AI/catalog) and the gateway (init
 * payload) so the displayed price always matches what is charged.
 */
export const TECH_GOLD_BASE_COST = 10;

export const techGoldCostForResearchedCount = (researchedCount: number): number => {
  let cost = TECH_GOLD_BASE_COST;
  for (let nthTech = 1; nthTech <= researchedCount; nthTech++) {
    const increment = nthTech < 5 ? 30 : nthTech < 10 ? 40 : 50;
    cost += increment;
  }
  return cost;
};

/**
 * The Coin a House pays for its next Manifest: the shared price less its
 * discount fraction (the Calculating Engine wonder: 0.1), rounded up. The
 * simulation charges this; every displayed Manifest price goes through it.
 */
export const manifestGoldCost = (researchedCount: number, discountFraction = 0): number =>
  Math.max(0, Math.ceil(techGoldCostForResearchedCount(researchedCount) * (1 - discountFraction)));

export type ManifestGoldRequirement = {
  gold: number;
  /** The undiscounted price, present only when a discount applies. */
  goldBeforeDiscount?: number;
  /** The discount fraction behind `gold` (0.1 = 10% off), present only when one applies. */
  goldDiscountFraction?: number;
};

/** A Manifest catalog entry's Coin requirement, carrying the base price and discount so the client can say why it is lower. */
export const manifestGoldRequirement = (researchedCount: number, discountFraction = 0): ManifestGoldRequirement => {
  const gold = manifestGoldCost(researchedCount, discountFraction);
  const base = techGoldCostForResearchedCount(researchedCount);
  return discountFraction > 0 && gold < base ? { gold, goldBeforeDiscount: base, goldDiscountFraction: discountFraction } : { gold };
};
