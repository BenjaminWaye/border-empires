import type { PopulationTier, TownGrowthUpgradeTier } from "../types.js";
import { TOWN_TIER_UPGRADE_GOLD_COST } from "../structure-slots/structure-slots.js";
import { SETTLEMENT_TO_TOWN_POPULATION_MIN } from "../config.js";

export type TownGrowthUpgradeView = {
  targetTier: TownGrowthUpgradeTier;
  requiredPopulation: number;
  // §5.4/user decision: gold, not a FOOD stockpile lump sum — FOOD's only
  // remaining role here is the +1 permanent slot demand the upgrade adds
  // (townFoodSlotDemandForTier, structure-slots.ts), gated server-side.
  goldCost: number;
  available: boolean;
};

export const CITY_POPULATION_MIN = 100_000;
export const GREAT_CITY_POPULATION_MIN = 1_000_000;
export const METROPOLIS_POPULATION_MIN = 5_000_000;

// A town's support ring is the tiles it can draw structures/tiles-owned from
// (chebyshev-distance neighborhood): the base 8-tile ring, for every tier.
//
// REVERTED (2026-09-10): 779ee143 added a second ring (distance-2 tiles, 16
// more on top of the base 8) for GREAT_CITY/METROPOLIS. That feature is
// removed here at the user's request. It also turned out to carry a real
// perf cost worth knowing about if it's ever reintroduced: the two hottest
// callers of this radius (supportTileBelongsToTown in
// economy-network-support-ring.ts, and the assignment scan in
// live-town-summary.ts) bounded their dx/dy loops by MAX_SUPPORT_RING_RADIUS
// unconditionally and only filtered each candidate's *own* tier inside the
// loop, after the tiles.get(keyFor(...)) lookup -- so raising the max to 2
// made every town of every tier pay a 25-cell scan instead of 9, not just the
// handful that could actually use the second ring. Re-add only with a
// tier-aware bound (e.g. skip the distance-2 shell unless the player owns a
// GREAT_CITY/METROPOLIS town) so the cost lands on the towns that use it.
export const MAX_SUPPORT_RING_RADIUS = 1;
export const supportRingRadiusForTier = (_populationTier: string | undefined): number => 1;

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
      requiredPopulation: SETTLEMENT_TO_TOWN_POPULATION_MIN,
      goldCost: TOWN_TIER_UPGRADE_GOLD_COST.TOWN,
      available: population >= SETTLEMENT_TO_TOWN_POPULATION_MIN
    };
  }
  if (currentTier === "TOWN") {
    return {
      targetTier: "CITY",
      requiredPopulation: CITY_POPULATION_MIN,
      goldCost: TOWN_TIER_UPGRADE_GOLD_COST.CITY,
      available: population >= CITY_POPULATION_MIN
    };
  }
  if (currentTier === "CITY") {
    return {
      targetTier: "GREAT_CITY",
      requiredPopulation: GREAT_CITY_POPULATION_MIN,
      goldCost: TOWN_TIER_UPGRADE_GOLD_COST.GREAT_CITY,
      available: population >= GREAT_CITY_POPULATION_MIN
    };
  }
  if (currentTier === "GREAT_CITY") {
    return {
      targetTier: "METROPOLIS",
      requiredPopulation: METROPOLIS_POPULATION_MIN,
      goldCost: TOWN_TIER_UPGRADE_GOLD_COST.METROPOLIS,
      available: population >= METROPOLIS_POPULATION_MIN
    };
  }
  return undefined;
};
