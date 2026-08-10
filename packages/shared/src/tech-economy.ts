/**
 * Tech research gold pricing.
 *
 * Tech-tree redesign decision (docs/manpower-economy-rewrite-plan.md §6.2):
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
