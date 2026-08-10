/**
 * Tech research gold pricing.
 *
 * Tech-tree redesign decision (docs/manpower-economy-rewrite-plan.md §6.2):
 * gold is no longer a per-tier or per-tech static number. Every tech costs
 * the SAME gold at any given moment, and each tech you have already
 * researched raises the price of every remaining tech by a flat increment.
 *
 * The increment itself escalates in tiers as more techs are researched:
 * - while fewer than 5 are researched: +10 per tech
 * - while fewer than 10 are researched: +40 per tech
 * - once 10 or more are researched: +50 per tech
 *
 * Shared by the simulation (charge/AI/catalog) and the gateway (init
 * payload) so the displayed price always matches what is charged.
 */
export const TECH_GOLD_BASE_COST = 30;

export const techGoldCostForResearchedCount = (researchedCount: number): number => {
  let cost = TECH_GOLD_BASE_COST;
  for (let alreadyResearched = 0; alreadyResearched < researchedCount; alreadyResearched++) {
    const increment = alreadyResearched < 5 ? 10 : alreadyResearched < 10 ? 40 : 50;
    cost += increment;
  }
  return cost;
};
