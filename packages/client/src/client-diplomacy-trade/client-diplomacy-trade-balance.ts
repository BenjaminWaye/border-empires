// Balancing an AI deal in one press, borrowed from Civ's "What would make this
// deal work?" and Old World's "even it out". The client already knows the AI's
// prices (the same shared rules the gateway decides with), so instead of
// nudging a good up by 1 until the verdict turns green, pressing a good adds
// exactly the amount that settles the deal:
// - a good on your side tops the deal up to the least the AI accepts;
// - a good on their side, when the deal already gives the AI more than it
//   needs, asks for as much of it as that surplus pays for.
// Suggest deal does the same for resource trades, which it used to skip.
import { netValueToAi, requiredForOffer, resourceSupplyCoinValue, type DiplomacyGoods, type DiplomacyTerms } from "@border-empires/shared";

import { TRADE_GOODS, theirHoldings, tradeAmount, withTradeAmount, type TradeGoodKey, type TradeGoodSpec } from "./client-diplomacy-trade-goods.js";
import { pricingFor, suggestedDeal, type DiplomacyStanceReply, type TradeSelection } from "./client-diplomacy-trade-view.js";

/**
 * The coin-equivalent the AI must net for this selection: 0 for a resource
 * trade (a fair exchange), its treaty price otherwise. undefined when there
 * is nothing to balance against: a human, an unread AI, a gift, or a treaty
 * it refuses at any price.
 */
export const aiRequiredValue = (reply: DiplomacyStanceReply | undefined, selection: TradeSelection): number | undefined => {
  if (!reply?.found || !reply.ai || !reply.pricing || selection.kind === "gift") return undefined;
  if (selection.kind === "trade") return 0;
  return requiredForOffer(pricingFor(reply.pricing, selection), selection.kind, selection.durationHours) ?? undefined;
};

/** One unit of a good in coin, as the AI values it (a supply slot at its daily value). */
export const tradeUnitValue = (spec: TradeGoodSpec): number =>
  spec.good === "gold" ? 1 : resourceSupplyCoinValue({ [spec.good]: 1 }, 24);

const held = (holdings: DiplomacyGoods, spec: TradeGoodSpec): number =>
  Math.max(0, Math.floor(spec.good === "gold" ? holdings.gold : (holdings.resources?.[spec.good] ?? 0)));

/**
 * The amount of `key` that settles the deal, or undefined when pressing it
 * should leave the amount alone: the deal is already accepted (your side) or
 * has no surplus to spend (their side), the AI can't be read, or nothing is
 * held. Never more than the giving side holds, so a price out of reach fills
 * what you have and the verdict says what is still missing.
 */
export const balancingAmount = (
  reply: DiplomacyStanceReply | undefined,
  selection: TradeSelection,
  own: DiplomacyGoods,
  key: TradeGoodKey
): number | undefined => {
  const required = aiRequiredValue(reply, selection);
  const spec = TRADE_GOODS.find((candidate) => candidate.key === key);
  if (required === undefined || !spec) return undefined;
  const surplus = netValueToAi(selection.terms) - required;
  const unit = tradeUnitValue(spec);
  const current = tradeAmount(selection.terms, spec);
  if (spec.side === "give") {
    if (surplus >= 0) return undefined;
    const next = Math.min(current + Math.ceil(-surplus / unit), held(own, spec));
    return next > current ? next : undefined;
  }
  // An AI never pays anything to join an alliance.
  const theirs = theirHoldings(reply);
  if (selection.kind === "alliance" || !theirs || surplus < unit) return undefined;
  const next = Math.min(current + Math.floor(surplus / unit), held(theirs, spec));
  return next > current ? next : undefined;
};

const applyBalance = (reply: DiplomacyStanceReply | undefined, selection: TradeSelection, own: DiplomacyGoods, specs: readonly TradeGoodSpec[]): DiplomacyTerms => {
  let terms = selection.terms;
  for (const spec of specs) {
    const amount = balancingAmount(reply, { ...selection, terms }, own, spec.key);
    if (amount !== undefined) terms = withTradeAmount(terms, spec.key, amount);
  }
  return terms;
};

/** Goods already in the deal first, then coin, then the rest: the player's chosen currency is used before anything new. */
const balanceOrder = (terms: DiplomacyTerms, side: TradeGoodSpec["side"]): TradeGoodSpec[] => {
  const specs = TRADE_GOODS.filter((spec) => spec.side === side);
  const inDeal = specs.filter((spec) => spec.supply && tradeAmount(terms, spec) > 0);
  const coin = specs.filter((spec) => !spec.supply);
  return [...inDeal, ...coin, ...specs.filter((spec) => spec.supply && !inDeal.includes(spec))];
};

/**
 * Suggest deal for a resource trade: keep what the player asked for, top up
 * their side until the AI accepts, then ask the AI for any surplus (coin,
 * then more of what was asked for), so the player never overpays. undefined when they can't afford it.
 */
const suggestedResourceTrade = (reply: DiplomacyStanceReply | undefined, selection: TradeSelection, own: DiplomacyGoods): DiplomacyTerms | undefined => {
  const required = aiRequiredValue(reply, selection);
  if (required === undefined) return undefined;
  const topped = applyBalance(reply, selection, own, balanceOrder(selection.terms, "give"));
  if (netValueToAi(topped) < required) return undefined;
  // Only coin and goods already asked for: never a resource the player didn't pick.
  const askOrder = TRADE_GOODS.filter((spec) => spec.side === "ask" && (!spec.supply || tradeAmount(topped, spec) > 0));
  return applyBalance(reply, { ...selection, terms: topped }, own, askOrder);
};

/** Suggest deal for every kind of offer: resource trades here, treaties and gifts as before. */
export const suggestedTradeDeal = (reply: DiplomacyStanceReply | undefined, selection: TradeSelection, own: DiplomacyGoods): DiplomacyTerms | undefined =>
  selection.kind === "trade" ? suggestedResourceTrade(reply, selection, own) : suggestedDeal(reply, selection, own);
