import { SETTLEMENT_TO_TOWN_POPULATION_MIN } from "../config.js";

export const FORCED_ANCILLARIFICATION_MANPOWER = 100;
export const FORCED_ANCILLARIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** A proportional sacrifice keeps mature towns from paying a negligible flat cost. */
export function forcedAncillarificationQuote(population: number): { populationCost: number; manpower: number; available: boolean } {
  const populationCost = Math.ceil(population / 50);
  return {
    populationCost,
    manpower: FORCED_ANCILLARIFICATION_MANPOWER,
    available: Number.isFinite(population) && populationCost > 0 && population - populationCost >= SETTLEMENT_TO_TOWN_POPULATION_MIN
  };
}
