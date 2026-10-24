import { RELIC_RULES } from "@border-empires/shared";
import type { RuntimeRushBuyCommandContext } from "./runtime-rush-buy-command.js";
import type { RuntimePlayer } from "./runtime-types.js";
import { activeRelicTiles, consumeRelicTile } from "./runtime-relics.js";
import { quickforgeAdjustedRushPrice, playerHasWonderType, stampQuickforgeRushUse } from "./runtime-natural-wonders.js";

export function quoteRelicRushBuy(context: RuntimeRushBuyCommandContext, actor: RuntimePlayer, basePrice: number, commandId: string): { price: number; commit: () => void } {
  const relics = context.relicContext;
  const nano = activeRelicTiles(relics, actor.id, "QUICKFORGE")[0];
  if (nano && basePrice > 0) return {
    price: Math.max(0, basePrice - RELIC_RULES.nanoDiscount),
    commit: () => consumeRelicTile(relics, nano, commandId)
  };
  const price = quickforgeAdjustedRushPrice(actor, playerHasWonderType(context.wonderCacheByPlayer, actor.id, "QUICKFORGE"), basePrice, context.now());
  return { price, commit: () => { if (price < basePrice) stampQuickforgeRushUse(actor, context.now()); } };
}
