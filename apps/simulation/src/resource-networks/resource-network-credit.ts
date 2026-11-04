import type { DomainTileState } from "@border-empires/game-domain";
import { emptyNetworkSiteCounts, NETWORK_RESOURCES, RESOURCE_NETWORKS, suppliedNetworkBuildings, networkCreditPerMinute, type NetworkSiteCounts, type NetworkSupplyStatus } from "@border-empires/shared";
import { countSupportedStructures } from "../economy-network/economy-network.js";

type NetworkTownCredit = { readonly salvage: number; readonly exports: number; readonly total: number; readonly slots: NetworkSiteCounts };
export type NetworkCreditAllocation = ReadonlyMap<string, NetworkTownCredit>;
const NO_CREDIT: NetworkTownCredit = { salvage: 0, exports: 0, total: 0, slots: emptyNetworkSiteCounts() };

/** Allocate each renewable slot once. Stable town order survives snapshot recovery.
 * Rebuilt with the existing economy context; bounded by the owner's fed towns.
 * No allocation state is persisted and a lost/dormant consumer releases its slots.
 */
export function allocateNetworkCredit(playerId: string, tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>, dormant: ReadonlySet<string>, sites: NetworkSiteCounts): NetworkCreditAllocation {
  const result = new Map<string, NetworkTownCredit>();
  if (sites.PRECURSOR_SALVAGE + sites.CATALYTIC_DEPOSIT + sites.LUXURY_BIOTA <= 0) return result;
  const remaining = { ...sites };
  for (const key of [...fedTownKeys].sort()) {
    const town = tiles.get(key);
    if (!town?.town || town.ownerId !== playerId || town.ownershipState !== "SETTLED" || town.town.populationTier === "SETTLEMENT") continue;
    const manufactories = remaining.PRECURSOR_SALVAGE > 0 ? countSupportedStructures(playerId, town, "MANUFACTORY", tiles, dormant) : 0;
    const nexuses = remaining.CATALYTIC_DEPOSIT + remaining.LUXURY_BIOTA > 0 ? countSupportedStructures(playerId, town, "TRADE_NEXUS", tiles, dormant) : 0;
    const slots = { ...emptyNetworkSiteCounts(),
      PRECURSOR_SALVAGE: suppliedNetworkBuildings(remaining.PRECURSOR_SALVAGE, manufactories),
      CATALYTIC_DEPOSIT: suppliedNetworkBuildings(remaining.CATALYTIC_DEPOSIT, nexuses),
      LUXURY_BIOTA: suppliedNetworkBuildings(remaining.LUXURY_BIOTA, nexuses) };
    const salvage = networkCreditPerMinute(remaining, "MANUFACTORY", manufactories);
    const exports = networkCreditPerMinute(remaining, "TRADE_NEXUS", nexuses);
    remaining.PRECURSOR_SALVAGE = Math.max(0, remaining.PRECURSOR_SALVAGE - manufactories);
    remaining.CATALYTIC_DEPOSIT = Math.max(0, remaining.CATALYTIC_DEPOSIT - nexuses);
    remaining.LUXURY_BIOTA = Math.max(0, remaining.LUXURY_BIOTA - nexuses);
    if (salvage + exports > 0) result.set(key, { salvage, exports, total: salvage + exports, slots });
    if (remaining.PRECURSOR_SALVAGE + remaining.CATALYTIC_DEPOSIT + remaining.LUXURY_BIOTA <= 0) break;
  }
  return result;
}

export const resourceNetworkTownCredit = (tile: Pick<DomainTileState, "x" | "y">, allocation: NetworkCreditAllocation): NetworkTownCredit =>
  allocation.get(`${tile.x},${tile.y}`) ?? NO_CREDIT;

/** Authoritative optional-supply counters for the economy panel, not build upkeep. */
export function networkSupplyStatus(sites: NetworkSiteCounts, allocation: NetworkCreditAllocation,
  settledTiles: readonly DomainTileState[], dormant: ReadonlySet<string>): NetworkSupplyStatus | undefined {
  if (!NETWORK_RESOURCES.some(resource => sites[resource] > 0)) return undefined;
  const used = emptyNetworkSiteCounts();
  for (const row of allocation.values()) for (const resource of NETWORK_RESOURCES) used[resource] += row.slots[resource];
  const count = (type: "ANCILLARY_FACTORY" | "ANCILLARY_DEPOT"): number => settledTiles.filter(tile =>
    tile.economicStructure?.type === type && tile.economicStructure.status === "active" &&
    tile.economicStructure.ownerId === tile.ownerId && !dormant.has(`${tile.x},${tile.y}`)).length;
  const factories = sites.CONDUCTIVE_MINERALS > 0 ? count("ANCILLARY_FACTORY") : 0;
  const depots = sites.NEURAL_RESIN > 0 ? count("ANCILLARY_DEPOT") : 0;
  for (const resource of NETWORK_RESOURCES) {
    const target = RESOURCE_NETWORKS[resource].target;
    if (target === "ANCILLARY_FACTORY" || target === "ANCILLARY_DEPOT") used[resource] = suppliedNetworkBuildings(sites[resource], target === "ANCILLARY_DEPOT" ? depots : factories);
  }
  return { supply: { ...sites }, used };
}
