import { TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, evaluateResourceTradeOffer, hasResourceSupplyOffer } from "@border-empires/shared";
// Pure view logic for the diplomacy trade screen: what the verdict line says
// and whether the offer can be sent. Uses the same shared pricing rules the
// gateway decides with, so "would accept" here means the AI really accepts.
import {
  aiCounterOffer,
  emptyDiplomacyTerms,
  evaluateAiOffer,
  extensionPricing,
  requiredForOffer,
  netValueToAi,
  type AiDiplomacyPricing,
  type AiGiftView,
  type DiplomacyGoods,
  type DiplomacyOfferKind,
  type DiplomacyTerms
} from "@border-empires/shared";

import { giftVerdict, suggestedGift } from "./client-diplomacy-gift-view.js";

export type DiplomacyStanceKind = "DISTRUSTFUL" | "SEEKING_PEACE" | "OUTMATCHED" | "WINNING" | "INDIFFERENT" | "WARY";

/** The gateway's DIPLOMACY_STANCE reply (apps/realtime-gateway diplomacy-stance-query.ts). */
export type DiplomacyStanceReply =
  | { found: false; targetPlayerName: string }
  | { found: true; targetPlayerName: string; targetPlayerId: string; ai: false }
  | {
      found: true;
      targetPlayerName: string;
      targetPlayerId: string;
      ai: true;
      stance?: { kind: DiplomacyStanceKind; reason: string };
      attitude?: { level: DiplomacyAttitude; score: number; modifiers: Array<{ label: string; value: number }> };
      /** The tile counts are absent from a gateway older than the war tally. */
      war?: { atWar: boolean; aiWinning: boolean; aiLosing: boolean; tilesTakenFromAi?: number; tilesTakenByAi?: number };
      truceRefusal?: string;
      allianceRefusal?: string;
      pricing?: AiDiplomacyPricing;
      /** Absent from a gateway older than gifts. */
      gift?: AiGiftView;
    };

export type DiplomacyAttitude = "FURIOUS" | "ANNOYED" | "CAUTIOUS" | "PLEASED" | "FRIENDLY";

export const ATTITUDE_LABEL: Record<DiplomacyAttitude, string> = {
  FURIOUS: "Furious",
  ANNOYED: "Annoyed",
  CAUTIOUS: "Cautious",
  PLEASED: "Pleased",
  FRIENDLY: "Friendly"
};

/** "Annoyed · At war (winning)" for the trade screen's header line. */
export const attitudeSummary = (reply: DiplomacyStanceReply | undefined): string => {
  if (!reply?.found || !reply.ai || !reply.attitude) return "";
  const war = reply.war?.atWar ? ` · At war${reply.war.aiWinning ? " (they're winning)" : reply.war.aiLosing ? " (they're losing)" : ""}` : "";
  return `${ATTITUDE_LABEL[reply.attitude.level]}${war}`;
};

/**
 * The tiles each side has taken in this war, as the AI counts them (recent
 * captures weigh most; old ones fade). Being 2+ tiles behind makes the AI
 * call itself losing, and 2+ ahead winning, but strength counts too: an
 * outmatched or desperate AI can be losing while level, and one that feels
 * stronger can be winning. undefined when not at war.
 */
export const warTally = (reply: DiplomacyStanceReply | undefined): { youTook: number; theyTook: number } | undefined => {
  if (!reply?.found || !reply.ai || !reply.war?.atWar) return undefined;
  const { tilesTakenFromAi, tilesTakenByAi } = reply.war;
  if (tilesTakenFromAi === undefined || tilesTakenByAi === undefined) return undefined;
  return { youTook: tilesTakenFromAi, theyTook: tilesTakenByAi };
};

/** "gift": coin/Shards for goodwill alone (client-diplomacy-gift-view.ts). "trade": an independent resource supply trade.
 * extendsTruce: a truce with this empire is running, so a truce offer extends it. */
export type TradeKind = DiplomacyOfferKind | "trade" | "gift";
export type TradeSelection = { kind: TradeKind; durationHours: 12 | 24; terms: DiplomacyTerms; extendsTruce?: boolean };

const extendsTruce = (selection: TradeSelection): boolean => selection.kind === "truce" && selection.extendsTruce === true;

/** The AI's prices for this offer: an extension never has the AI pay (shared extensionPricing, as the gateway decides). */
const pricingFor = (pricing: AiDiplomacyPricing, selection: TradeSelection): AiDiplomacyPricing =>
  extendsTruce(selection) ? extensionPricing(pricing) : pricing;

export type TradeVerdict = {
  tone: "good" | "bad" | "neutral";
  text: string;
  canSend: boolean;
  sendLabel: string;
};

const offerLabel = (selection: TradeSelection): string =>
  selection.kind === "trade" ? "a resource trade" : selection.kind === "alliance" ? "an alliance" : `a ${selection.durationHours}h truce${extendsTruce(selection) ? " extension" : ""}`;

export const formatOfferCooldown = (remainingMs: number): string => `${Math.max(1, Math.ceil(remainingMs / 60_000))}m`;

export const tradeVerdict = (input: {
  targetName: string;
  reply: DiplomacyStanceReply | undefined;
  selection: TradeSelection;
  own: DiplomacyGoods;
  cooldownRemainingMs: number;
}): TradeVerdict => {
  const { targetName, reply, selection, own } = input;
  const kind = selection.kind;
  if (kind === "gift") return giftVerdict(input);
  const sendLabel =
    kind === "trade" ? "Offer resource trade" : kind === "alliance" ? "Propose alliance" : extendsTruce(selection) ? `Offer ${selection.durationHours}h extension` : `Offer ${selection.durationHours}h truce`;
  if (input.cooldownRemainingMs > 0) {
    return { tone: "bad", text: `You recently made ${targetName} this kind of offer.`, canSend: false, sendLabel: `Can offer again in ${formatOfferCooldown(input.cooldownRemainingMs)}` };
  }
  if (selection.terms.give.gold > own.gold || selection.terms.give.shard > own.shard) {
    return { tone: "bad", text: `You only have ${own.gold} coin and ${own.shard} Shards.`, canSend: false, sendLabel };
  }
  const missingResource = TRADABLE_SUPPLY_RESOURCES.find(resource => (selection.terms.give.resources?.[resource] ?? 0) > (own.resources?.[resource] ?? 0));
  if (missingResource) return { tone: "bad", text: `You only have ${own.resources?.[missingResource] ?? 0} spare ${supplyResourceLabel(missingResource)} slots.`, canSend: false, sendLabel };
  const hasSupply = hasResourceSupplyOffer(selection.terms.give.resources) || hasResourceSupplyOffer(selection.terms.ask.resources);
  if (hasSupply && !own.resources) return {tone:"bad",text:"Reconnect before negotiating resource supply.",canSend:false,sendLabel};
  if (kind === "trade") {
    if (!hasSupply) return {tone:"neutral",text:"Add a resource supply slot to make an independent trade offer.",canSend:false,sendLabel};
    if (reply && !reply.found) return {tone:"bad",text:`No empire named ${targetName}.`,canSend:false,sendLabel};
    if (reply?.found && reply.ai && reply.pricing) {
      const answer = evaluateResourceTradeOffer(selection.terms,reply.pricing.aiHoldings);
      return {tone:answer.accepts?"good":"bad",text:answer.accepts?`${targetName} would accept this resource trade.`:`${targetName} would decline these resource terms.`,canSend:true,sendLabel};
    }
    return {tone:"neutral",text:`Supply continues until either House cancels. ${targetName} will decide on the offer.`,canSend:true,sendLabel};
  }
  if (reply && !reply.found) return { tone: "bad", text: `No empire named ${targetName}.`, canSend: false, sendLabel };
  if (!reply) return { tone: "neutral", text: `Reading ${targetName}'s mood…`, canSend: true, sendLabel };
  if (!reply.ai) return { tone: "neutral", text: `${targetName} will decide for themselves.`, canSend: true, sendLabel };
  if (!reply.pricing) return { tone: "neutral", text: `${targetName} can't be read right now. You can still send the offer.`, canSend: true, sendLabel };

  const pricing = pricingFor(reply.pricing, selection);
  const verdict = evaluateAiOffer(pricing, kind, selection.durationHours, selection.terms);
  if (verdict.accepts) return { tone: "good", text: `${targetName} would accept ${offerLabel(selection)} on these terms.`, canSend: true, sendLabel };
  if (verdict.reason === "refuses") {
    const refusal = kind === "alliance" ? reply.allianceRefusal : reply.truceRefusal;
    return { tone: "bad", text: refusal ?? `${targetName} won't agree to ${offerLabel(selection)} at any price right now.`, canSend: true, sendLabel };
  }
  if (verdict.reason === "aiWontPay") return { tone: "bad", text: `${targetName} won't give anything to join an alliance.`, canSend: true, sendLabel };
  if (verdict.reason === "aiCannotPay") return { tone: "bad", text: `${targetName} doesn't have that much to give.`, canSend: true, sendLabel };
  const required = requiredForOffer(pricing, kind, selection.durationHours) ?? 0;
  // An extension costs a content AI nothing, and it never pays for one: the shortfall is only what was asked of it.
  if (extendsTruce(selection) && required === 0) return { tone: "bad", text: `${targetName} won't pay anything to extend a truce.`, canSend: true, sendLabel };
  const spareCoin = Math.max(0, own.gold - selection.terms.give.gold);
  const affordable = spareCoin + Math.max(0, own.shard - selection.terms.give.shard) * reply.pricing.shardCoinValue >= verdict.shortfall;
  const offered = netValueToAi(selection.terms, reply.pricing.shardCoinValue);
  return {
    tone: "bad",
    text: affordable
      ? `${targetName} would refuse: wants about ${verdict.shortfall} more coin.`
      : `${targetName} wants about ${Math.max(0, Math.ceil(required - offered))} coin for this, more than you can offer.`,
    canSend: true,
    sendLabel
  };
};

/**
 * Civ's "what would make this deal work?": the best terms for the player that
 * the AI still accepts. An AI that wants peace badly enough to pay is asked
 * for all it would pay; otherwise it is offered the least of the player's
 * coin, then Shards, that covers its price. undefined when no deal is
 * possible: a human target, an unread AI, a refusal, or a price the player
 * can't meet.
 */
export const suggestedDeal = (reply: DiplomacyStanceReply | undefined, selection: TradeSelection, own: DiplomacyGoods): DiplomacyTerms | undefined => {
  const kind = selection.kind;
  if (kind === "gift") return suggestedGift(reply, own);
  if (kind === "trade" || !reply?.found || !reply.ai || !reply.pricing) return undefined;
  const pricing = pricingFor(reply.pricing, selection);
  const required = requiredForOffer(pricing, kind, selection.durationHours);
  if (required === null) return undefined;
  if (required < 0) return { give: { gold: 0, shard: 0 }, ask: { gold: Math.min(-required, pricing.aiHoldings.gold), shard: 0 } };
  const counter = aiCounterOffer(pricing, kind, selection.durationHours, emptyDiplomacyTerms(), own);
  return counter.kind === "counter" ? counter.terms : undefined;
};
