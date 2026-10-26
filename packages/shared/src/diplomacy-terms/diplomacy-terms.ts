import { resourceSupplyCoinValue, missingResourceSupply, clampedResourceSupply, RESOURCE_SUPPLY_COIN_VALUE_PER_DAY } from "../resource-supply-trades/resource-supply-valuation.js";
// Terms attached to a truce or alliance offer, and the pure rules an AI uses
// to price them. Shared so the client's live "would they accept?" preview
// and the gateway's real decision run the exact same arithmetic.
//
// Coin and Shards settle once; optional resource amounts are continuing supply
// commitments, backed by actual production instead of stockpile deductions.
import { z } from "zod";
import { ResourceSupplyOfferSchema, hasResourceSupplyOffer, supplyResourceLabel, TRADABLE_SUPPLY_RESOURCES } from "../resource-supply-trades/resource-supply-trades.js";

export type DiplomacyOfferKind = "truce" | "alliance";
export type DiplomacyGoods = z.infer<typeof DiplomacyGoodsSchema>;

/** From the proposer's point of view: `give` goes to the target, `ask` comes from the target. */
export type DiplomacyTerms = z.infer<typeof DiplomacyTermsSchema>;

/** Per-item cap on a single offer -- far above any real stockpile, but rules out absurd payloads. */
export const MAX_DIPLOMACY_TERM_AMOUNT = 1_000_000;

export const DiplomacyGoodsSchema = z.object({
  gold: z.number().int().min(0).max(MAX_DIPLOMACY_TERM_AMOUNT),
  shard: z.number().int().min(0).max(MAX_DIPLOMACY_TERM_AMOUNT),
  resources: ResourceSupplyOfferSchema.optional()
});
export const DiplomacyTermsSchema = z.object({
  give: DiplomacyGoodsSchema, ask: DiplomacyGoodsSchema,
  supplyDurationHours: z.union([z.literal(12), z.literal(24)]).optional()
});

/**
 * Marks a truce/alliance request as a counter to an offer the sender received:
 * the gateway rejects that offer (without a re-offer cooldown) in the same step,
 * so "their offer is gone" and "my counter is pending" can't race.
 */
export type DiplomacyCounterRef = { kind: DiplomacyOfferKind; requestId: string };
export const DiplomacyCounterRefSchema = z.object({ kind: z.enum(["truce", "alliance"]), requestId: z.string().min(1) });

export const EMPTY_DIPLOMACY_GOODS: DiplomacyGoods = { gold: 0, shard: 0 };
export const emptyDiplomacyTerms = (): DiplomacyTerms => ({ give: { ...EMPTY_DIPLOMACY_GOODS }, ask: { ...EMPTY_DIPLOMACY_GOODS } });

export const diplomacyTermsAreEmpty = (terms: DiplomacyTerms | undefined): boolean =>
  !terms || (terms.give.gold === 0 && terms.give.shard === 0 && terms.ask.gold === 0 && terms.ask.shard === 0 &&
    !hasResourceSupplyOffer(terms.give.resources) && !hasResourceSupplyOffer(terms.ask.resources));

/** The same deal seen from the other side. */
export const swapDiplomacyTerms = (terms: DiplomacyTerms): DiplomacyTerms => ({
  give: { ...terms.ask, ...(terms.ask.resources ? { resources: { ...terms.ask.resources } } : {}) },
  ask: { ...terms.give, ...(terms.give.resources ? { resources: { ...terms.give.resources } } : {}) },
  ...(terms.supplyDurationHours ? { supplyDurationHours: terms.supplyDurationHours } : {})
});

const goodsLabel = (goods: DiplomacyGoods): string => {
  const parts: string[] = [];
  if (goods.gold > 0) parts.push(`${goods.gold} coin`);
  if (goods.shard > 0) parts.push(`${goods.shard} ${goods.shard === 1 ? "Shard" : "Shards"}`);
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    const count = goods.resources?.[resource] ?? 0;
    if (count > 0) parts.push(`${count} ${supplyResourceLabel(resource)} supply ${count === 1 ? "slot" : "slots"}`);
  }
  return parts.join(" and ");
};

/** "Beejac pays 50 coin; you pay 2 Shards" -- from the recipient's point of view. */
export const describeDiplomacyTermsForRecipient = (terms: DiplomacyTerms | undefined, proposerName: string): string => {
  if (diplomacyTermsAreEmpty(terms) || !terms) return "";
  const parts: string[] = [];
  const theyPay = goodsLabel(terms.give);
  const youPay = goodsLabel(terms.ask);
  if (theyPay) parts.push(`${proposerName} pays ${theyPay}`);
  if (youPay) parts.push(`you pay ${youPay}`);
  const text = parts.join("; ");
  return hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources)
    ? `${text}; resource supply for ${terms.supplyDurationHours ?? 12}h` : text;
};

/** "you pay 50 coin; Milo pays 2 Shards" -- from the proposer's point of view. */
export const describeDiplomacyTermsForProposer = (terms: DiplomacyTerms | undefined, targetName: string): string => {
  if (diplomacyTermsAreEmpty(terms) || !terms) return "";
  const parts: string[] = [];
  const youPay = goodsLabel(terms.give);
  const theyPay = goodsLabel(terms.ask);
  if (youPay) parts.push(`you pay ${youPay}`);
  if (theyPay) parts.push(`${targetName} pays ${theyPay}`);
  const text = parts.join("; ");
  return hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources)
    ? `${text}; resource supply for ${terms.supplyDurationHours ?? 12}h` : text;
};

// --- AI pricing -----------------------------------------------------------

/**
 * Everything the client needs to preview an AI's answer locally. `required*`
 * is the net coin-equivalent the AI must receive for that offer; negative
 * means it would pay up to that much itself; null means it refuses outright.
 */
export type AiDiplomacyPricing = {
  required: { truce12: number | null; truce24: number | null; alliance: number | null };
  shardCoinValue: number;
  aiHoldings: DiplomacyGoods;
};

/** Coin-equivalent of one Shard when an AI weighs a deal. A first guess, tunable. */
export const SHARD_COIN_VALUE = 25;

// An AI never pays to join an alliance: its alliance price is never negative.
export const requiredForOffer = (pricing: AiDiplomacyPricing, kind: DiplomacyOfferKind, durationHours: 12 | 24): number | null => {
  if (kind === "alliance") return pricing.required.alliance === null ? null : Math.max(0, pricing.required.alliance);
  return durationHours === 24 ? pricing.required.truce24 : pricing.required.truce12;
};

const asksAnything = (terms: DiplomacyTerms): boolean => terms.ask.gold > 0 || terms.ask.shard > 0 || hasResourceSupplyOffer(terms.ask.resources);

/** Net coin-equivalent flowing to the AI target under these terms. */
export const netValueToAi = (terms: DiplomacyTerms, shardCoinValue: number): number =>
  terms.give.gold + terms.give.shard * shardCoinValue - terms.ask.gold - terms.ask.shard * shardCoinValue +
  resourceSupplyCoinValue(terms.give.resources, terms.supplyDurationHours ?? 12) - resourceSupplyCoinValue(terms.ask.resources, terms.supplyDurationHours ?? 12);

export type AiOfferVerdict =
  | { accepts: true }
  | { accepts: false; reason: "refuses" }
  /** Alliances: the AI gives nothing, so any ask is refused outright. */
  | { accepts: false; reason: "aiWontPay" }
  | { accepts: false; reason: "aiCannotPay"; missing: DiplomacyGoods }
  | { accepts: false; reason: "shortfall"; shortfall: number };

export const evaluateAiOffer = (
  pricing: AiDiplomacyPricing,
  kind: DiplomacyOfferKind,
  durationHours: 12 | 24,
  terms: DiplomacyTerms
): AiOfferVerdict => {
  const required = requiredForOffer(pricing, kind, durationHours);
  if (required === null) return { accepts: false, reason: "refuses" };
  if (kind === "alliance" && asksAnything(terms)) return { accepts: false, reason: "aiWontPay" };
  const missing: DiplomacyGoods = {
    gold: Math.max(0, terms.ask.gold - pricing.aiHoldings.gold),
    shard: Math.max(0, terms.ask.shard - pricing.aiHoldings.shard)
  };
  const missingSupply = missingResourceSupply(terms.ask.resources, pricing.aiHoldings.resources);
  if (hasResourceSupplyOffer(missingSupply)) missing.resources = missingSupply;
  if (missing.gold > 0 || missing.shard > 0 || hasResourceSupplyOffer(missingSupply)) return { accepts: false, reason: "aiCannotPay", missing };
  const shortfall = required - netValueToAi(terms, pricing.shardCoinValue);
  return shortfall > 0 ? { accepts: false, reason: "shortfall", shortfall: Math.ceil(shortfall) } : { accepts: true };
};

export type AiCounterOffer =
  | { kind: "counter"; terms: DiplomacyTerms }
  | { kind: "cannotAfford"; shortfall: number }
  | { kind: "refuses" };

/**
 * The smallest change to the requester's terms that the AI would accept,
 * never asking for more than the requester actually holds: first drop what
 * the requester asked the AI for, then ask for the requester's coin, then
 * their Shards. If even everything they have isn't enough, the AI says so
 * instead of naming a price they can't pay.
 */
export const aiCounterOffer = (
  pricing: AiDiplomacyPricing,
  kind: DiplomacyOfferKind,
  durationHours: 12 | 24,
  terms: DiplomacyTerms,
  requesterHoldings: DiplomacyGoods
): AiCounterOffer => {
  const required = requiredForOffer(pricing, kind, durationHours);
  if (required === null) return { kind: "refuses" };
  const next: DiplomacyTerms = {
    give: { ...terms.give, ...(terms.give.resources ? { resources: { ...terms.give.resources } } : {}) },
    // Never counter by asking the AI to pay more than it holds, nor anything at all for an alliance.
    ask:
      kind === "alliance"
        ? { gold: 0, shard: 0 }
        : { gold: Math.min(terms.ask.gold, pricing.aiHoldings.gold), shard: Math.min(terms.ask.shard, pricing.aiHoldings.shard) }
  };
  if (terms.supplyDurationHours) next.supplyDurationHours = terms.supplyDurationHours;
  if (kind !== "alliance") {
    const resources = clampedResourceSupply(terms.ask.resources, pricing.aiHoldings.resources);
    if (hasResourceSupplyOffer(resources)) next.ask.resources = resources;
  }
  let deficit = required - netValueToAi(next, pricing.shardCoinValue);
  if (deficit <= 0) return { kind: "counter", terms: next };
  const value = pricing.shardCoinValue;

  const dropAskGold = Math.min(next.ask.gold, Math.ceil(deficit));
  next.ask.gold -= dropAskGold;
  deficit -= dropAskGold;
  if (deficit > 0 && value > 0) {
    const dropAskShard = Math.min(next.ask.shard, Math.ceil(deficit / value));
    next.ask.shard -= dropAskShard;
    deficit -= dropAskShard * value;
  }
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    if (deficit <= 0) break;
    const unitValue = RESOURCE_SUPPLY_COIN_VALUE_PER_DAY[resource] * (next.supplyDurationHours ?? 12) / 24;
    const drop = Math.min(next.ask.resources?.[resource] ?? 0, Math.ceil(deficit / unitValue));
    if (drop > 0 && next.ask.resources) { next.ask.resources[resource] = (next.ask.resources[resource] ?? 0) - drop; deficit -= drop * unitValue; }
  }
  if (deficit > 0) {
    const addGold = Math.min(Math.max(0, requesterHoldings.gold - next.give.gold), Math.ceil(deficit));
    next.give.gold += addGold;
    deficit -= addGold;
  }
  if (deficit > 0 && value > 0) {
    const addShard = Math.min(Math.max(0, requesterHoldings.shard - next.give.shard), Math.ceil(deficit / value));
    next.give.shard += addShard;
    deficit -= addShard * value;
  }
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    if (deficit <= 0) break;
    const unitValue = RESOURCE_SUPPLY_COIN_VALUE_PER_DAY[resource] * (next.supplyDurationHours ?? 12) / 24;
    const available = Math.max(0, (requesterHoldings.resources?.[resource] ?? 0) - (next.give.resources?.[resource] ?? 0));
    const add = Math.min(available, Math.ceil(deficit / unitValue));
    if (add > 0) { next.give.resources ??= {}; next.give.resources[resource] = (next.give.resources[resource] ?? 0) + add; deficit -= add * unitValue; }
  }
  if (deficit > 0) return { kind: "cannotAfford", shortfall: Math.ceil(deficit) };
  return { kind: "counter", terms: next };
};
