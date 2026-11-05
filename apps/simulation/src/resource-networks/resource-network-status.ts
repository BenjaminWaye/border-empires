import {
  BIOTA_SLOTS_PER_SITE, biotaSlotsNeededForTier, NETWORK_RESOURCES,
  type NetworkSiteCounts, type NetworkSupplyStatus, type PopulationTier
} from "@border-empires/shared";

/**
 * Economy-panel counters for frontier sites. Material and salvage sites always
 * pay out; biota sites count as used while some town above Town tier needs
 * their slots. Bounded by the owner's towns.
 */
export function networkSupplyStatus(sites: NetworkSiteCounts, townTiers: Iterable<PopulationTier | undefined>): NetworkSupplyStatus | undefined {
  if (!NETWORK_RESOURCES.some(resource => sites[resource] > 0)) return undefined;
  let biotaSlotsNeeded = 0;
  for (const tier of townTiers) if (tier) biotaSlotsNeeded += biotaSlotsNeededForTier(tier);
  const used = { ...sites, LUXURY_BIOTA: Math.min(sites.LUXURY_BIOTA, Math.ceil(biotaSlotsNeeded / BIOTA_SLOTS_PER_SITE)) };
  return { supply: { ...sites }, used };
}
