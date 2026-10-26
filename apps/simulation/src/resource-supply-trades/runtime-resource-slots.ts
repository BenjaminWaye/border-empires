import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "../runtime-types.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { RuntimeEconomyCaches } from "../runtime-economy-caches/runtime-economy-caches.js";
import { resourceSlotDemandForPlayer, resourceSlotDormantContributorsForPlayer, type ResourceSlotTotals, type ResourceSlotDormancy } from "../resource-slot-view/resource-slot-view.js";
import { resourceSlotSupplyWithSiphonTransfer } from "../siphon-mode/siphon-slot-transfer.js";
import { domainGrantedResourceSlots } from "../tech-domain-bridge/tech-domain-bridge.js";
import { slotWaiversForPlayer } from "../tech-domain-bridge/slot-waivers.js";
import { techGrantedFishFoodSlotBonus } from "../tech-domain-bridge/fish-food-slot-bonus.js";
import { mergeResourceSlotGrants } from "../resource-slot-view/resource-slot-grants-merge.js";
import { addRelicResourceSupply } from "../runtime-relics.js";
import * as wonderEffects from "../runtime-natural-wonders.js";

export interface RuntimeResourceSlotsContext {
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, RuntimePlayer>;
  caches: RuntimeEconomyCaches;
  tileSettledAtByKey: ReadonlyMap<string, number>;
  wonderCacheByPlayer: Map<string, Set<string>>;
  summaryForPlayer(id: string): PlayerRuntimeSummary;
  settledTilesForPlayer(id: string): DomainTileState[];
  activeObservatoryKeysForPlayer(id: string): Iterable<string>;
  tradedSupply?: (id: string) => ResourceSlotTotals;
  advanceTrades?: () => void;
}
export function ownedResourceTiles(ctx: RuntimeResourceSlotsContext, id: string): DomainTileState[] {
  return [...ctx.summaryForPlayer(id).territoryTileKeys].map(key => ctx.tiles.get(key))
    .filter((tile): tile is DomainTileState => Boolean(tile && tile.ownerId === id));
}
/** Physical source supply, deliberately independent of imports and dormancy. */
export function physicalResourceSlots(ctx: RuntimeResourceSlotsContext, playerId: string): ResourceSlotTotals {
  const playerOf = (id: string) => ctx.players.get(id);
  const totals = resourceSlotSupplyWithSiphonTransfer({ playerId, tiles: ctx.tiles,
    settledTilesForPlayer: ctx.settledTilesForPlayer, activeObservatoryKeysForPlayer: ctx.activeObservatoryKeysForPlayer,
    grantedSupplyForPlayer: id => { const p = playerOf(id); return p ? mergeResourceSlotGrants(domainGrantedResourceSlots(p), p.waystationResourceSlotBonus) : undefined; },
    fishFoodSlotBonusForPlayer: id => { const p = playerOf(id); return p ? techGrantedFishFoodSlotBonus(p) : 0; } });
  wonderEffects.applyFoundryHeartSlotBonus(wonderEffects.playerHasWonderType(ctx.wonderCacheByPlayer, playerId, "FOUNDRY_HEART"), totals);
  addRelicResourceSupply({ tiles: ctx.tiles, summaryForPlayer: ctx.summaryForPlayer }, playerOf(playerId), totals);
  return totals;
}
export function cachedResourceSlots(ctx: RuntimeResourceSlotsContext, id: string, fresh = false): ResourceSlotTotals {
  ctx.advanceTrades?.();
  return ctx.caches.resourceSlotSupply(id, fresh, () => ctx.tradedSupply?.(id) ?? physicalResourceSlots(ctx, id));
}
export function cachedResourceDemand(ctx: RuntimeResourceSlotsContext, id: string, fresh = false): ResourceSlotTotals {
  return ctx.caches.resourceSlotDemand(id, fresh, () => {
    const p = ctx.players.get(id);
    return resourceSlotDemandForPlayer(ownedResourceTiles(ctx, id), id, p ? slotWaiversForPlayer(p) : undefined, ctx.tileSettledAtByKey);
  });
}
export function cachedResourceDormancy(ctx: RuntimeResourceSlotsContext, id: string): ResourceSlotDormancy {
  ctx.advanceTrades?.();
  return ctx.caches.resourceSlotDormancy(id, () => {
    const p = ctx.players.get(id);
    return resourceSlotDormantContributorsForPlayer(ownedResourceTiles(ctx, id), id, cachedResourceSlots(ctx, id), p ? slotWaiversForPlayer(p) : undefined, ctx.tileSettledAtByKey);
  });
}

export function dormantContributorTiles(dormancy: ResourceSlotDormancy, suffix: string, acrossAllResources = false): ReadonlySet<string> {
  const result = new Set<string>();
  for (const resourceSet of acrossAllResources ? Object.values(dormancy) : [dormancy.FOOD]) {
    for (const key of resourceSet) if (key.endsWith(suffix)) result.add(key.slice(0, -suffix.length));
  }
  return result;
}
