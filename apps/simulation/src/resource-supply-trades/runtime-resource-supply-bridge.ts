import { siphonedResourceTilesForPlayer } from "../siphon-mode/siphon-slot-transfer.js";
import { runtimeLogInfo } from "../runtime-log/runtime-log.js";
import type { ResourceSupplyAgreement } from "@border-empires/shared";
import { RuntimeResourceSupply } from "./runtime-resource-supply.js";
import { cachedResourceSlots, ownedResourceTiles, physicalResourceSlots, type RuntimeResourceSlotsContext } from "./runtime-resource-slots.js";
import type { ResourceSupplyLedgerContext } from "./resource-supply-ledger.js";
import type { RuntimePassiveIncomeContext } from "../runtime-passive-income.js";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { supplyEndedImpacts } from "./supply-ended-impacts.js";

export interface ResourceSupplyBridgeContext {
  slots(): RuntimeResourceSlotsContext;
  now(): number;
  beforeChange: ResourceSupplyLedgerContext["beforeChange"];
  changed: ResourceSupplyLedgerContext["changed"];
  publish?: (id: string) => void;
  /** Chronicle cards when a deal ends (supply-ended-impacts.ts). */
  recordPersonalImpact?: (event: PersonalImpactEvent) => void;
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
    ended: (agreement, reason, byPlayerId) => {
      for (const impact of supplyEndedImpacts(agreement, reason, byPlayerId, reason === "EXPIRED" ? agreement.expiresAt ?? ctx.now() : ctx.now())) ctx.recordPersonalImpact?.(impact);
    },
    invalidate: ids => {
      const caches = ctx.slots().caches;
      for (const id of ids) {
        caches.invalidateEconomySnapshot(id);
        caches.resourceSlotSupplyCacheByPlayer.delete(id); caches.resourceSlotDormancyCacheByPlayer.delete(id);
        caches.manpowerStructureBonusCacheByPlayer.delete(id); caches.upkeepAccrualCacheByPlayer.delete(id);
      }
    }
  }, restored);
  runtimeLogInfo({ resourceSupplyAgreementCount: supply.ledger.size }, "resource_supply_restored");
  return supply;
}

/** The slot context's traded-supply hooks, absent until the supply ledger exists (runtime boot order). */
export const tradedSupplyHooks = (supply: RuntimeResourceSupply | undefined, now: () => number): Pick<RuntimeResourceSlotsContext, "tradedSupplyBuild" | "tradedSupply" | "advanceTrades"> =>
  supply ? {
    tradedSupplyBuild: (id, physical) => supply.upkeepWithSources(id, physical),
    tradedSupply: (id) => supply.upkeep(id),
    advanceTrades: () => supply.ledger.advanceTo(now())
  } : {};

export const passiveIncomeSupply = (
  players: RuntimePassiveIncomeContext["players"], supply: RuntimeResourceSupply | undefined
): Pick<RuntimePassiveIncomeContext, "players" | "activeCoinTransfers"> => ({
  players,
  ...(supply ? { activeCoinTransfers: (id, at) => supply.ledger.coinTransfers(id, at) } : {})
});
