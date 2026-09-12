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
// city's larger footprint. Don't hand-roll a scan against these two raw
// values -- use supportRingCandidates (town-support-ring.ts), the one place
// that actually walks the ring (wrap-aware); see its doc comment for why.
//
// History (read before touching either export): this shipped, got reverted
// for cost twice (b1bef0f6 2026-09-10, db4057f1 2026-09-12 prod incident),
// and was restored a third time (this change) with the actual bug fixed at
// its root instead of gated more coarsely. Both prior costings assumed
// every consumer had to bound its own dx/dy loop by the max radius and
// filter per-candidate afterwards -- true for a caller who already knows a
// SPECIFIC town's tier (hasSupportedStructure/countSupportedStructures here,
// supportedConverterGoldPerMinuteForTown), which is fine: that scan is
// already scoped to just that one town's own radius. The actual cost class
// was in the OTHER kind of caller -- one scanning OUTWARD from a support
// tile whose owning town isn't known yet (supportTileBelongsToTown here,
// assignedTownKeyForSupportTile in town-support-lookup.ts, and
// live-town-summary.ts's own copy) -- which used to gate its widened scan on
// playerHasWideSupportRingTown, "does this player own a wide-ring town
// ANYWHERE." Once true, EVERY such lookup for that player paid the 25-cell
// scan, including ones nowhere near the actual wide-ring town -- e.g. every
// frontier tile checked by autoSettlementQueueForPlayer's hasTownSupport
// callback (runtime.ts). Live prod evidence: one player with 6698 frontier
// tiles triggered 6650 support-ring lookups in a single
// auto_settlement_queue_rebuild call (725ms), stacking into the event-loop
// stalls that caused the 2026-09-12 incident. Fixed at the root this time:
// those three "scan outward" callers now use wideSupportRingScanRadiusFor
// (town-support-ring.ts), which only widens the scan for a candidate that's
// actually within MAX_SUPPORT_RING_RADIUS of one of the player's real
// wide-ring towns, not merely gated on whether one exists anywhere in their
// empire -- see that function's own doc comment.
export const MAX_SUPPORT_RING_RADIUS = 2;
export const supportRingRadiusForTier = (populationTier: string | undefined): number =>
  populationTier === "GREAT_CITY" || populationTier === "METROPOLIS" ? 2 : 1;

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
