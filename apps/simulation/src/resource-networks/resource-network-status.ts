import {
  BIOTA_SLOTS_PER_SITE, biotaSlotsNeededForTier, biotaSlotsNeededFromSites, NETWORK_RESOURCES,
  type NetworkSiteCounts, type NetworkSupplyStatus, type PopulationTier
} from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { countSupportedStructures } from "../economy-network/economy-network.js";

/**
 * Economy-panel counters for frontier sites. Material and salvage sites always
 * pay out; biota sites count as used while some town above Town tier needs
 * their slots (after the town's own Vivaria). Bounded by the owner's towns.
 */
export type BiotaDemandTown = { readonly tier: PopulationTier | undefined; readonly vivaria?: number };

export function networkSupplyStatus(sites: NetworkSiteCounts, towns: Iterable<BiotaDemandTown>): NetworkSupplyStatus | undefined {
  if (!NETWORK_RESOURCES.some(resource => sites[resource] > 0)) return undefined;
  let biotaSlotsNeeded = 0;
  for (const town of towns) if (town.tier) biotaSlotsNeeded += biotaSlotsNeededFromSites(town.tier, town.vivaria);
  const used = { ...sites, LUXURY_BIOTA: Math.min(sites.LUXURY_BIOTA, Math.ceil(biotaSlotsNeeded / BIOTA_SLOTS_PER_SITE)) };
  return { supply: { ...sites }, used };
}

/** Owned towns with the active Vivaria that support each one, for {@link networkSupplyStatus}. */
export const biotaDemandTowns = (
  playerId: string,
  townTiles: Iterable<DomainTileState | undefined>,
  tiles: ReadonlyMap<string, DomainTileState>,
  dormantEconomicStructureKeys: ReadonlySet<string>
): BiotaDemandTown[] => {
  const towns: BiotaDemandTown[] = [];
  for (const tile of townTiles) {
    const tier = tile?.town?.populationTier;
    if (!tile || !tier || biotaSlotsNeededForTier(tier) <= 0) continue;
    towns.push({ tier, vivaria: countSupportedStructures(playerId, tile, "VIVARIUM", tiles, dormantEconomicStructureKeys) });
  }
  return towns;
};
