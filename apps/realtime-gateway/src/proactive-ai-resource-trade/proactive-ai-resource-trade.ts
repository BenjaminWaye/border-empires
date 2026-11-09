// AI-initiated FOOD supply trades.
//
// Resource supply trades (packages/shared/src/resource-supply-trades/) let any
// House export spare FOOD/TITANIUM/CRYSTAL/UMBRITE/network slots to another,
// and an AI already accepts a fair offer someone sends it. But nothing made an
// AI *ask*: on staging season-41, eight AIs sat at zero spare FOOD (each Relay
// Beacon past the first five costs a FOOD slot, so FOOD caps expansion) while
// ai-2 had 144 FOOD slots spare and player-1 59.
//
// One AI per tick (the 15s proactive diplomacy tick): if it has no FOOD
// headroom and no offer already pending, it asks a House with spare FOOD for a
// few slots, paying with a surplus resource of at least equal value, or coin.
// Other AIs are asked first (they answer at once); human neighbours after.
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import {
  OFFERABLE_SUPPLY_RESOURCES,
  resourceSupplyCoinValue,
  type DiplomacyTerms,
  type ResourceSupplyOffer
} from "@border-empires/shared";
import { aiDiplomacyNeighbors } from "../proactive-ai-diplomacy/proactive-ai-diplomacy.js";
import type { ResourceTradeService } from "../resource-trade/resource-trade-service.js";

/** Most FOOD slots an AI asks for in one offer. */
export const MAX_AI_FOOD_ASK = 3;
/** Houses whose holdings one tick may look up. */
export const MAX_TRADE_CANDIDATES_PER_TICK = 4;
/** After asking a House (accepted or not), don't ask it again for this long. */
export const AI_FOOD_TRADE_TARGET_COOLDOWN_MS = 6 * 3_600_000;

type SnapshotPlayer = NonNullable<PlayerSubscriptionSnapshot["player"]>;
export type TradePlayerState = Partial<Pick<SnapshotPlayer, "gold" | "resourceTradeHoldings" | "resourceSlots">>;
type TradeTile = Pick<PlayerSubscriptionSnapshot["tiles"][number], "x" | "y" | "ownerId">;

export interface ProactiveAiResourceTradeDeps {
  aiPlayerIds: ReadonlySet<string>;
  hasLiveSocket(playerId: string): boolean;
  /** The AI's own tiles (for neighbours) and player state. */
  fetchAiSnapshot(playerId: string): Promise<{ tiles: readonly TradeTile[]; player?: TradePlayerState | undefined } | undefined>;
  /** Another House's player state (holdings only). */
  playerState(playerId: string): Promise<TradePlayerState | undefined>;
  trades: Pick<ResourceTradeService, "request" | "outgoingOfferCount">;
  recordEvent(level: "info" | "warn", event: string, payload: Record<string, unknown>): void;
  seasonEnded?: () => Promise<boolean>;
  now(): number;
}

type Offerable = (typeof OFFERABLE_SUPPLY_RESOURCES)[number];
/** Coin value of one slot of `resource` for a day — the AI's own valuation (resource-supply-valuation.ts). */
const dailyValue = (resource: Offerable): number => resourceSupplyCoinValue({ [resource]: 1 }, 24);

/** FOOD slots this AI should ask for, or 0 while it still has headroom. */
export const foodSlotsWanted = (player: TradePlayerState | undefined): number => {
  const slots = player?.resourceSlots;
  if (!slots) return 0;
  const deficit = (slots.demand.FOOD ?? 0) - (slots.supply.FOOD ?? 0);
  return deficit < 0 ? 0 : Math.min(MAX_AI_FOOD_ASK, deficit + 1);
};

/**
 * Terms asking `food` FOOD slots, paid with the AI's best surplus resource
 * (fewest slots that cover the daily value) or, failing that, one-off coin
 * worth a day of the FOOD — the same value an AI seller needs to accept
 * (evaluateResourceTradeOffer / netValueToAi). Undefined when it can't pay.
 */
export const foodTradeTerms = (food: number, buyer: TradePlayerState | undefined): DiplomacyTerms | undefined => {
  if (food <= 0) return undefined;
  const value = food * dailyValue("FOOD");
  const ask = { gold: 0, resources: { FOOD: food } satisfies ResourceSupplyOffer };
  let best: { resource: Offerable; count: number } | undefined;
  for (const resource of OFFERABLE_SUPPLY_RESOURCES) {
    if (resource === "FOOD") continue;
    const price = dailyValue(resource);
    const count = Math.ceil(value / price);
    if (price <= 0 || (buyer?.resourceTradeHoldings?.[resource] ?? 0) < count) continue;
    if (!best || count * price < best.count * dailyValue(best.resource)) best = { resource, count };
  }
  if (best) return { give: { gold: 0, resources: { [best.resource]: best.count } }, ask };
  const gold = Math.ceil(value);
  return Math.floor(buyer?.gold ?? 0) >= gold ? { give: { gold }, ask } : undefined;
};

export function createProactiveAiResourceTrade(deps: ProactiveAiResourceTradeDeps): { tick(): Promise<void> } {
  let cursor = 0;
  let running = false;
  // `${aiId}>${targetId}` -> expiry. Bounded by AI count x Houses; pruned every tick.
  const asked = new Map<string, number>();
  return { tick: async () => {
    if (running || deps.aiPlayerIds.size === 0) return;
    running = true;
    try {
      if (deps.seasonEnded && await deps.seasonEnded()) return;
      const now = deps.now();
      for (const [key, until] of asked) if (until <= now) asked.delete(key);
      const ids = [...deps.aiPlayerIds];
      const aiId = ids[cursor % ids.length]!;
      cursor = (cursor + 1) % (ids.length * 1000);
      if (deps.hasLiveSocket(aiId) || deps.trades.outgoingOfferCount(aiId) > 0) return;
      const ai = await deps.fetchAiSnapshot(aiId);
      const wanted = foodSlotsWanted(ai?.player);
      if (!ai || wanted === 0) return;
      const humans = aiDiplomacyNeighbors(ai.tiles, aiId).filter(id => !deps.aiPlayerIds.has(id));
      const otherAis = ids.filter(id => id !== aiId && !deps.hasLiveSocket(id));
      const rotation = cursor % Math.max(1, otherAis.length);
      const candidates = [...otherAis.slice(rotation), ...otherAis.slice(0, rotation), ...humans]
        .filter(id => !asked.has(`${aiId}>${id}`)).slice(0, MAX_TRADE_CANDIDATES_PER_TICK);
      for (const targetId of candidates) {
        const spare = (await deps.playerState(targetId))?.resourceTradeHoldings?.FOOD ?? 0;
        const food = Math.min(wanted, spare);
        const terms = foodTradeTerms(food, ai.player);
        if (!terms) continue;
        asked.set(`${aiId}>${targetId}`, now + AI_FOOD_TRADE_TARGET_COOLDOWN_MS);
        const result = await deps.trades.request(aiId, targetId, terms);
        deps.recordEvent("info", result.ok ? "gateway_ai_food_trade_offer" : "gateway_ai_food_trade_declined",
          { aiPlayerId: aiId, targetId, food, ...(result.ok ? {} : { reason: result.message }) });
        if (result.ok) return;
      }
    } catch (error) {
      deps.recordEvent("warn", "gateway_ai_food_trade_tick_failed", { error: error instanceof Error ? error.message : String(error) });
    } finally { running = false; }
  } };
}
