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
// REVERTED AGAIN (2026-09-12, prod incident): 90433ec4 restored the
// GREAT_CITY/METROPOLIS second ring (distance-2, 16 more tiles) after an
// earlier revert (b1bef0f6, 2026-09-10) for the same underlying cost class,
// gating the wider scan behind playerHasWideSupportRingTown ("does this
// player own a wide-ring town ANYWHERE"). That gate is too coarse: once a
// player owns a single GREAT_CITY/METROPOLIS town anywhere in their empire,
// EVERY support-tile lookup for that player pays the 25-cell scan instead of
// 9 -- including ones nowhere near that town, e.g. every frontier tile
// checked by autoSettlementQueueForPlayer's hasTownSupport callback
// (runtime.ts). Live production log evidence: one player with 6698 frontier
// tiles triggered 6650 support-ring lookups in a single
// auto_settlement_queue_rebuild call (725ms), immediately followed by the
// simulation worker crashing (event-loop-blocked stalls stacking past the
// watchdog's kill threshold) and a wave of dropped/never-completing client
// connections. Reverted the same single-point way as b1bef0f6: pinning both
// exports back to a flat 1 collapses every consumer (supportRingCandidates
// and everything built on it, client and server alike) back to the pre-ring2
// 8-tile behavior without touching call sites. Re-add only with a bound
// scoped to actual proximity to the wide-ring town itself, not "this player
// owns one anywhere" -- e.g. skip the distance-2 shell unless the candidate
// tile is within MAX_SUPPORT_RING_RADIUS of a GREAT_CITY/METROPOLIS town,
// not merely gated on whether one exists anywhere in the player's empire.
export const MAX_SUPPORT_RING_RADIUS = 1;
export const supportRingRadiusForTier = (_populationTier: string | undefined): number => 1;

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
