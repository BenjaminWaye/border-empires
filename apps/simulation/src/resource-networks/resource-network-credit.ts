import type { DomainTileState } from "@border-empires/game-domain";
import { networkCreditPerMinute, type NetworkSiteCounts } from "@border-empires/shared";
import { countSupportedStructures } from "../economy-network/economy-network.js";

export function resourceNetworkTownCredit(playerId: string, townTile: DomainTileState, tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>, dormant: ReadonlySet<string>, sites: NetworkSiteCounts): { salvage: number; exports: number; total: number } {
  if (!townTile.town || townTile.town.populationTier === "SETTLEMENT" || !fedTownKeys.has(`${townTile.x},${townTile.y}`)) {
    return { salvage: 0, exports: 0, total: 0 };
  }
  const salvage = sites.PRECURSOR_SALVAGE > 0 ? networkCreditPerMinute(sites, "MANUFACTORY", countSupportedStructures(playerId, townTile, "MANUFACTORY", tiles, dormant)) : 0;
  const exports = sites.CATALYTIC_DEPOSIT > 0 || sites.LUXURY_BIOTA > 0 ? networkCreditPerMinute(sites, "TRADE_NEXUS", countSupportedStructures(playerId, townTile, "TRADE_NEXUS", tiles, dormant)) : 0;
  return { salvage, exports, total: salvage + exports };
}
