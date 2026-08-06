/**
 * Tech research gold pricing.
 *
 * Tech-tree redesign decision (docs/manpower-economy-rewrite-plan.md §6.2):
 * gold is no longer a per-tier or per-tech static number. Every tech costs
 * the SAME gold at any given moment, and each tech you have already
 * researched raises the price of every remaining tech by a flat increment.
 * The first research costs TECH_GOLD_BASE_COST; the Nth costs
 * base + TECH_GOLD_PER_RESEARCHED × (N-1).
 *
 * Shared by the simulation (charge/AI/catalog) and the gateway (init
 * payload) so the displayed price always matches what is charged.
 */
export const TECH_GOLD_BASE_COST = 10;
export const TECH_GOLD_PER_RESEARCHED = 50;

export const techGoldCostForResearchedCount = (researchedCount: number): number =>
  TECH_GOLD_BASE_COST + TECH_GOLD_PER_RESEARCHED * researchedCount;
