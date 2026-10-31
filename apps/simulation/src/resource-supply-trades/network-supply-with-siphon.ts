import type { DomainTileState } from "@border-empires/game-domain";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, emptyNetworkSiteCounts, type NetworkSiteCounts } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";
import { developedNetworkSites } from "../resource-networks/resource-networks.js";
import { isResourceTileSiphonedAway } from "../siphon-mode/siphon-slot-transfer.js";
import { resourceSlotDormantContributorsForPlayer, type ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";

export interface NetworkSiphonContext {
  player(id: string): RuntimePlayer | undefined;
  ownedTiles(id: string): DomainTileState[];
  effectiveUpkeep(id: string): ResourceSlotTotals;
  siphonedTiles(id: string): readonly DomainTileState[];
  tileSettledAtByKey: ReadonlyMap<string, number>;
}

/** The supplier must still authorise its extractor. Extractors have no slot
 * upkeep, so the dormancy filter below currently excludes nothing. Siphon transfers
 * its supply slots, never duplicates them or turns an undeveloped deposit into supply. */
export function networkSupplyWithSiphon(ctx: NetworkSiphonContext, playerId: string): NetworkSiteCounts {
  const domestic = (id: string, selected?: ReadonlySet<string>): NetworkSiteCounts => {
    const player = ctx.player(id);
    if (!NETWORK_RESOURCES.some(resource => player?.techIds.has(RESOURCE_NETWORKS[resource].tech))) return emptyNetworkSiteCounts();
    const tiles = ctx.ownedTiles(id);
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles, id, ctx.effectiveUpkeep(id), player ? slotWaiversForPlayer(player) : undefined, ctx.tileSettledAtByKey);
    const dormant = new Set([...dormancy.FOOD].filter(key => key.endsWith(":economicStructure")).map(key => key.slice(0, -18)));
    return developedNetworkSites(tiles.filter(tile => selected ? selected.has(`${tile.x},${tile.y}`) : !isResourceTileSiphonedAway(tile,id)), id, dormant, player?.techIds);
  };
  const result = domestic(playerId);
  const byOwner = new Map<string, Set<string>>();
  for (const tile of ctx.siphonedTiles(playerId)) {
    if (!tile.ownerId || tile.ownerId === playerId || tile.sabotage?.ownerId !== playerId || !isResourceTileSiphonedAway(tile,tile.ownerId)) continue;
    const keys = byOwner.get(tile.ownerId) ?? new Set<string>();
    keys.add(`${tile.x},${tile.y}`); byOwner.set(tile.ownerId,keys);
  }
  for (const [ownerId,keys] of byOwner) {
    const stolen = domestic(ownerId,keys);
    for (const resource of NETWORK_RESOURCES) result[resource] += stolen[resource];
  }
  return result;
}
