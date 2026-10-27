import { siphonedResourceTilesForPlayer } from "../siphon-mode/siphon-slot-transfer.js";
import { runtimeLogInfo } from "../runtime-log/runtime-log.js";
import { type ResourceSupplyAgreement, NETWORK_RESOURCES, emptyNetworkSiteCounts } from "@border-empires/shared";
import { allocateNetworkCredit, networkSupplyStatus } from "../resource-networks/resource-network-credit.js";
import { buildFedTownKeys } from "../economy-network/economy-network.js";
import { resourceSlotDormantContributorsForPlayer } from "../resource-slot-view/resource-slot-view.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import { RuntimeResourceSupply } from "./runtime-resource-supply.js";
import { cachedResourceSlots, ownedResourceTiles, physicalResourceSlots, type RuntimeResourceSlotsContext } from "./runtime-resource-slots.js";
import type { ResourceSupplyLedgerContext } from "./resource-supply-ledger.js";

export interface ResourceSupplyBridgeContext {
  slots(): RuntimeResourceSlotsContext;
  now(): number;
  beforeChange: ResourceSupplyLedgerContext["beforeChange"];
  changed: ResourceSupplyLedgerContext["changed"];
  publish?: (id: string) => void;
}
export function createRuntimeResourceSupply(ctx: ResourceSupplyBridgeContext, restored: readonly ResourceSupplyAgreement[] = []): RuntimeResourceSupply {
  const supply = new RuntimeResourceSupply({ now: ctx.now, player: id => ctx.slots().players.get(id),
    ownedTiles: id => ownedResourceTiles(ctx.slots(), id), physicalUpkeep: id => physicalResourceSlots(ctx.slots(), id),
    resourceSlotSources: id => {
      const slots = ctx.slots();
      cachedResourceSlots(slots, id, true);
      return slots.caches.resourceSlotSources(id);
    },
    tileSettledAtByKey: ctx.slots().tileSettledAtByKey,
    siphonCasterIds: () => ctx.slots().activeObservatoryOwners?.() ?? [],
    siphonedTiles: id => siphonedResourceTilesForPlayer({playerId:id,tiles:ctx.slots().tiles,activeObservatoryKeysForPlayer:ctx.slots().activeObservatoryKeysForPlayer}),
    cachedPlayerState: id => {
      const caches=ctx.slots().caches, projection=caches.economySnapshotCacheByPlayer.get(id)?.resourceTradeProjection;
      return projection && projection.dormancy===caches.resourceSlotDormancyCacheByPlayer.get(id) ? projection.state : undefined;
    },
    cachePlayerState: (id,state) => {
      const caches=ctx.slots().caches, cell=caches.economySnapshotCacheByPlayer.get(id);
      if(cell)cell.resourceTradeProjection={dormancy:caches.resourceSlotDormancyCacheByPlayer.get(id),state};
    },
    beforeChange: ctx.beforeChange, publish: ids => { for (const id of ids) ctx.publish?.(id); },
    capacityRejected: () => runtimeLogInfo({ resourceSupplyAgreementCount: supply.ledger.size }, "resource_supply_capacity_rejected"),
    changed: (action, agreement) => {
      ctx.changed(action, agreement);
      runtimeLogInfo({ resourceSupplyAgreementCount: supply.ledger.size, action }, "resource_supply_agreements");
    },
    invalidate: ids => {
      const caches = ctx.slots().caches;
      for (const id of ids) {
        caches.invalidateEconomySnapshot(id);
        caches.resourceSlotSupplyCacheByPlayer.delete(id); caches.resourceSlotDormancyCacheByPlayer.delete(id);
        caches.manpowerStructureBonusCacheByPlayer.delete(id); caches.upkeepAccrualCacheByPlayer.delete(id);
      }
    },
    networkUsed: (id, sites) => {
      if (!NETWORK_RESOURCES.some(resource=>sites[resource]>0)) return emptyNetworkSiteCounts();
      const slots = ctx.slots(), tiles = ownedResourceTiles(slots, id), player = slots.players.get(id);
      const supply = slots.tradedSupply?.(id) ?? physicalResourceSlots(slots, id);
      const dormancy = resourceSlotDormantContributorsForPlayer(tiles, id, supply, player ? slotWaiversForPlayer(player) : undefined, slots.tileSettledAtByKey);
      const dormant = new Set([...dormancy.FOOD].filter(key => key.endsWith(":economicStructure")).map(key => key.slice(0, -18)));
      const dormantTowns = new Set([...dormancy.FOOD].filter(key => key.endsWith(":town")).map(key => key.slice(0, -5)));
      const fed = buildFedTownKeys(id, slots.summaryForPlayer(id), slots.tiles, dormantTowns);
      return networkSupplyStatus(sites, allocateNetworkCredit(id, slots.tiles, fed, dormant, sites),
        tiles.filter(tile => tile.ownershipState === "SETTLED"), dormant)?.used ?? emptyNetworkSiteCounts();
    }
  }, restored);
  runtimeLogInfo({ resourceSupplyAgreementCount: supply.ledger.size }, "resource_supply_restored");
  return supply;
}
