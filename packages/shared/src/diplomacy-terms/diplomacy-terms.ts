// Terms attached to a truce or alliance offer, and the pure rules an AI uses
// to price them. Shared so the client's live "would they accept?" preview
// and the gateway's real decision run the exact same arithmetic.
//
// Only gold and Shards are tradeable: they are the only real stockpiles.
// FOOD/TITANIUM/CRYSTAL/UMBRITE are slot-gated, not spendable stock (see
// stripRetiredStockpileCost in the simulation).
import { z } from "zod";

export type DiplomacyOfferKind = "truce" | "alliance";
export type DiplomacyGoods = { gold: number; shard: number };

/** From the proposer's point of view: `give` goes to the target, `ask` comes from the target. */
export type DiplomacyTerms = { give: DiplomacyGoods; ask: DiplomacyGoods };

/** Per-item cap on a single offer -- far above any real stockpile, but rules out absurd payloads. */
export const MAX_DIPLOMACY_TERM_AMOUNT = 1_000_000;

const goodsSchema = z.object({
  gold: z.number().int().min(0).max(MAX_DIPLOMACY_TERM_AMOUNT),
  shard: z.number().int().min(0).max(MAX_DIPLOMACY_TERM_AMOUNT)
});
export const DiplomacyTermsSchema = z.object({ give: goodsSchema, ask: goodsSchema });

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
  !terms || (terms.give.gold === 0 && terms.give.shard === 0 && terms.ask.gold === 0 && terms.ask.shard === 0);

/** The same deal seen from the other side. */
export const swapDiplomacyTerms = (terms: DiplomacyTerms): DiplomacyTerms => ({ give: { ...terms.ask }, ask: { ...terms.give } });

const goodsLabel = (goods: DiplomacyGoods): string => {
  const parts: string[] = [];
  if (goods.gold > 0) parts.push(`${goods.gold} coin`);
  if (goods.shard > 0) parts.push(`${goods.shard} ${goods.shard === 1 ? "Shard" : "Shards"}`);
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
  return parts.join("; ");
};

/** "you pay 50 coin; Milo pays 2 Shards" -- from the proposer's point of view. */
export const describeDiplomacyTermsForProposer = (terms: DiplomacyTerms | undefined, targetName: string): string => {
  if (diplomacyTermsAreEmpty(terms) || !terms) return "";
  const parts: string[] = [];
  const youPay = goodsLabel(terms.give);
  const theyPay = goodsLabel(terms.ask);
  if (youPay) parts.push(`you pay ${youPay}`);
  if (theyPay) parts.push(`${targetName} pays ${theyPay}`);
  return parts.join("; ");
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

const asksAnything = (terms: DiplomacyTerms): boolean => terms.ask.gold > 0 || terms.ask.shard > 0;

/** Net coin-equivalent flowing to the AI target under these terms. */
export const netValueToAi = (terms: DiplomacyTerms, shardCoinValue: number): number =>
  terms.give.gold + terms.give.shard * shardCoinValue - terms.ask.gold - terms.ask.shard * shardCoinValue;

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
  const missing = {
    gold: Math.max(0, terms.ask.gold - pricing.aiHoldings.gold),
    shard: Math.max(0, terms.ask.shard - pricing.aiHoldings.shard)
  };
  if (missing.gold > 0 || missing.shard > 0) return { accepts: false, reason: "aiCannotPay", missing };
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
    give: { ...terms.give },
    // Never counter by asking the AI to pay more than it holds, nor anything at all for an alliance.
    ask:
      kind === "alliance"
        ? { gold: 0, shard: 0 }
        : { gold: Math.min(terms.ask.gold, pricing.aiHoldings.gold), shard: Math.min(terms.ask.shard, pricing.aiHoldings.shard) }
  };
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
  if (deficit > 0) return { kind: "cannotAfford", shortfall: Math.ceil(deficit) };
  return { kind: "counter", terms: next };
};
