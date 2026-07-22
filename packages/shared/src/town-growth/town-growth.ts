import type { PopulationTier, TownGrowthUpgradeTier } from "../types.js";

export type TownGrowthUpgradeView = {
  targetTier: TownGrowthUpgradeTier;
  requiredPopulation: number;
  foodCost: number;
  available: boolean;
};

export const CITY_POPULATION_MIN = 100_000;
export const GREAT_CITY_POPULATION_MIN = 1_000_000;
export const METROPOLIS_POPULATION_MIN = 5_000_000;

/** Food cost to manually upgrade a town tier (lump sum). Matches game-domain TIER_UPGRADE_FOOD_COST. */
export const TOWN_GROWTH_FOOD_COST: Record<TownGrowthUpgradeTier, number> = {
  TOWN: 0,
  CITY: 500,
  GREAT_CITY: 2_000,
  METROPOLIS: 8_000
};

const POPULATION_TIER_RANK: Record<PopulationTier, number> = {
  SETTLEMENT: 0,
  TOWN: 1,
  CITY: 2,
  GREAT_CITY: 3,
  METROPOLIS: 4
};

export const townPopulationTierFromPopulation = (population: number, populationTownMin: number): PopulationTier => {
  if (population >= METROPOLIS_POPULATION_MIN) return "METROPOLIS";
  if (population >= GREAT_CITY_POPULATION_MIN) return "GREAT_CITY";
  if (population >= CITY_POPULATION_MIN) return "CITY";
  if (population >= populationTownMin) return "TOWN";
  return "SETTLEMENT";
};

export const initialTownGrowthTierCap = (
  population: number,
  populationTownMin: number,
  isSettlement = false
): PopulationTier => {
  if (isSettlement && population < populationTownMin) return "TOWN";
  const derivedTier = townPopulationTierFromPopulation(population, populationTownMin);
  return derivedTier === "SETTLEMENT" ? "TOWN" : derivedTier;
};

export const capTownPopulationTier = (populationTier: PopulationTier, growthTierCap?: PopulationTier): PopulationTier => {
  if (!growthTierCap) return populationTier;
  return POPULATION_TIER_RANK[populationTier] <= POPULATION_TIER_RANK[growthTierCap] ? populationTier : growthTierCap;
};

export const nextTownGrowthUpgrade = (
  currentTier: PopulationTier,
  population: number
): TownGrowthUpgradeView | undefined => {
  if (currentTier === "SETTLEMENT") {
    return {
      targetTier: "TOWN",
      requiredPopulation: 0,
      foodCost: TOWN_GROWTH_FOOD_COST.TOWN,
      available: true
    };
  }
  if (currentTier === "TOWN") {
    return {
      targetTier: "CITY",
      requiredPopulation: CITY_POPULATION_MIN,
      foodCost: TOWN_GROWTH_FOOD_COST.CITY,
      available: population >= CITY_POPULATION_MIN
    };
  }
  if (currentTier === "CITY") {
    return {
      targetTier: "GREAT_CITY",
      requiredPopulation: GREAT_CITY_POPULATION_MIN,
      foodCost: TOWN_GROWTH_FOOD_COST.GREAT_CITY,
      available: population >= GREAT_CITY_POPULATION_MIN
    };
  }
  if (currentTier === "GREAT_CITY") {
    return {
      targetTier: "METROPOLIS",
      requiredPopulation: METROPOLIS_POPULATION_MIN,
      foodCost: TOWN_GROWTH_FOOD_COST.METROPOLIS,
      available: population >= METROPOLIS_POPULATION_MIN
    };
  }
  return undefined;
};
