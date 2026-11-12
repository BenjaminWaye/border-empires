// AI-initiated sales of spare upkeep slots: the other half of the FOOD
// purchases in proactive-ai-resource-trade.ts. An AI with slots to spare
// offers a neighbouring player who has run out of that resource a few of
// them, priced at a day's value (the same valuation every AI accepts:
// resource-supply-valuation.ts), payable in coin or, when the buyer is short
// of coin, a different spare upkeep resource of equal value. AIs already ask
// for what they need themselves, so sales only go to players.
//
// Supply runs until someone ends it, so the AI ends a sale once the day the
// buyer paid for has passed (expiredSurplusSale), and offers again if the
// buyer is still short.
import { resourceSupplyCoinValue, type DiplomacyTerms } from "@border-empires/shared";

import type { TradePlayerState } from "./proactive-ai-resource-trade.js";

/** Spare slots of a resource the AI keeps for its own growth before selling any. */
export const AI_SALE_RESERVE_SLOTS = 2;
/** Most slots of one resource in one sale. */
export const MAX_AI_SALE_SLOTS = 3;
/** How long a sale runs before the AI ends it: the day the buyer paid for. */
export const AI_SALE_DURATION_HOURS = 24;
/** Agreements made through the resource-trade service (resource-trade-service.ts), as opposed to treaty supply. */
export const RESOURCE_TRADE_AGREEMENT_PREFIX = "diplomacy-settle:resource-trade:";

// Only upkeep slots. Network resources count every developed site as
// pledgeable (runtime-resource-supply.ts), i.e. producing, not spare.
const SALE_RESOURCES = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"] as const;
type SaleResource = (typeof SALE_RESOURCES)[number];
const dailyValue = (resource: SaleResource): number => resourceSupplyCoinValue({ [resource]: 1 }, 24);

/** Slots of `resource` the buyer needs: up to one past its shortfall, once it has no headroom left. */
const slotsNeeded = (buyer: TradePlayerState | undefined, resource: SaleResource): number => {
  const slots = buyer?.resourceSlots;
  if (!slots) return 0;
  const demand = slots.demand[resource] ?? 0;
  const deficit = demand - (slots.supply[resource] ?? 0);
  return demand <= 0 || deficit < 0 ? 0 : deficit + 1;
};

/**
 * What the AI would sell this buyer, or undefined: the first upkeep resource
 * the buyer is out of and the AI has to spare beyond its reserve, priced at a
 * day's value in coin, else in another of the buyer's spare upkeep slots.
 */
export const surplusSaleTerms = (seller: TradePlayerState | undefined, buyer: TradePlayerState | undefined): DiplomacyTerms | undefined => {
  for (const resource of SALE_RESOURCES) {
    const spare = (seller?.resourceTradeHoldings?.[resource] ?? 0) - AI_SALE_RESERVE_SLOTS;
    const count = Math.min(MAX_AI_SALE_SLOTS, spare, slotsNeeded(buyer, resource));
    if (count <= 0) continue;
    const value = count * dailyValue(resource);
    const give = { gold: 0, resources: { [resource]: count } };
    const gold = Math.ceil(value);
    if (Math.floor(buyer?.gold ?? 0) >= gold) return { give, ask: { gold } };
    for (const payment of SALE_RESOURCES) {
      if (payment === resource) continue;
      const paymentCount = Math.ceil(value / dailyValue(payment));
      if ((buyer?.resourceTradeHoldings?.[payment] ?? 0) >= paymentCount) return { give, ask: { gold: 0, resources: { [payment]: paymentCount } } };
    }
  }
  return undefined;
};

/** A sale this AI made through the resource-trade service that has run for the day it was paid for. */
export const expiredSurplusSale = (aiId: string, player: TradePlayerState | undefined, nowMs: number): string | undefined =>
  player?.resourceTradeAgreements?.find(row => row.proposerId === aiId && row.id.startsWith(RESOURCE_TRADE_AGREEMENT_PREFIX) &&
    SALE_RESOURCES.some(resource => (row.proposerGives[resource] ?? 0) > 0) && (row.targetGives.FOOD ?? 0) === 0 &&
    nowMs - row.startedAt >= AI_SALE_DURATION_HOURS * 3_600_000)?.id;
