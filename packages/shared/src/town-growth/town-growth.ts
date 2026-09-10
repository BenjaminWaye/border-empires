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
// (chebyshev-distance neighborhood). Reaching GREAT_CITY adds a second ring
// (distance-2 tiles, 16 more tiles on top of the base 8), reflecting a great
// city's larger footprint. The highest tier a loop needs to scan is
// MAX_SUPPORT_RING_RADIUS; callers should bound their dx/dy loops by it and
// then filter each candidate by supportRingRadiusForTier of the *town* tile
// it would belong to.
//
// PERF NOTE (2026-09-10 incident, see town-growth.ts's git history for the
// short-lived full revert): two callers -- supportTileBelongsToTown in
// economy-network-support-ring.ts, and its wire-shaped duplicate in
// live-town-summary.ts -- used to bound their dx/dy loops by
// MAX_SUPPORT_RING_RADIUS unconditionally, so every town of every tier paid
// a 25-cell scan instead of 9, not just the handful that could actually use
// the second ring. Both now gate the wider scan behind
// playerHasWideSupportRingTown (below), memoized per tiles-snapshot so the
// one-time O(world) cost of checking "does this player own a GREAT_CITY/
// METROPOLIS town" is paid once per player per recompute, not once per
// support-tile check.
export const MAX_SUPPORT_RING_RADIUS = 2;
export const supportRingRadiusForTier = (populationTier: string | undefined): number =>
  populationTier === "GREAT_CITY" || populationTier === "METROPOLIS" ? 2 : 1;

// Memoized per tiles-snapshot (WeakMap key), not per call: a single economy
// recompute calls this many times per player (once per support-tile/
// structure-type check), and the underlying check is an O(world) tile scan.
// WeakMap keying means this is auto-GC'd the moment a fresh snapshot map
// replaces the old one -- no explicit eviction needed, satisfying the
// bound-every-growable-map rule without a manual cleanup path.
const wideSupportRingCache = new WeakMap<object, Map<string, boolean>>();
export const playerHasWideSupportRingTown = <T>(
  playerId: string,
  tiles: ReadonlyMap<string, T>,
  isOwnedWideRingTown: (tile: T) => boolean
): boolean => {
  let perPlayer = wideSupportRingCache.get(tiles);
  if (!perPlayer) {
    perPlayer = new Map();
    wideSupportRingCache.set(tiles, perPlayer);
  }
  const cached = perPlayer.get(playerId);
  if (cached !== undefined) return cached;
  let found = false;
  for (const tile of tiles.values()) {
    if (isOwnedWideRingTown(tile)) {
      found = true;
      break;
    }
  }
  perPlayer.set(playerId, found);
  return found;
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
