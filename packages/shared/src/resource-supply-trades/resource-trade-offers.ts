import { z } from "zod";
import { DiplomacyTermsSchema, evaluateAiOffer, hasRecurringCoin } from "../diplomacy-terms/diplomacy-terms.js";
import { hasResourceSupplyOffer } from "./resource-supply-trades.js";
import { StoredOfferNoteSchema } from "../diplomacy-offer-notes/diplomacy-offer-notes.js";
export const MAX_PENDING_RESOURCE_TRADE_OFFERS = 256;
export const MAX_PENDING_RESOURCE_TRADE_OFFERS_PER_PLAYER = 16;
export const RESOURCE_TRADE_OFFER_TTL_MS = 24 * 3_600_000;
export const ResourceTradeOfferSchema = z.object({
  id:z.string().min(1).max(128),fromPlayerId:z.string().min(1).max(128),toPlayerId:z.string().min(1).max(128),
  fromPlayerName:z.string().max(256),toPlayerName:z.string().max(256),terms:DiplomacyTermsSchema,
  createdAt:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative(),status:z.enum(["pending","settling"]),
  /** The sender's note (diplomacy-offer-notes.ts), already cleaned. */
  note:StoredOfferNoteSchema.optional()
}).refine(row=>row.fromPlayerId!==row.toPlayerId && row.expiresAt>row.createdAt &&
  (hasResourceSupplyOffer(row.terms.give.resources)||hasResourceSupplyOffer(row.terms.ask.resources)));
export type ResourceTradeOffer = z.infer<typeof ResourceTradeOfferSchema>;

/** Independent trades have no treaty price; the AI requires a fair exchange. */
export const evaluateResourceTradeOffer = (terms: import("../diplomacy-terms/diplomacy-terms.js").DiplomacyTerms,
  holdings: import("../diplomacy-terms/diplomacy-terms.js").DiplomacyGoods): ReturnType<typeof evaluateAiOffer> =>
  // An AI takes Coin per hour only for a truce (diplomacy-terms aiTakesRecurringCoin), never in an independent trade.
  hasRecurringCoin(terms) ? { accepts: false, reason: "refuses" } : evaluateAiOffer({
    required:{truce12:0,truce24:0,alliance:0},aiHoldings:holdings
  },"truce",12,terms);
