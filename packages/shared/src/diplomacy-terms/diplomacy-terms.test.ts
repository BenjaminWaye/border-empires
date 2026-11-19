import { describe, expect, it } from "vitest";

import {
  aiCounterOffer,
  AI_RECURRING_COIN_VALUE_SHARE,
  describeDiplomacyTermsForProposer,
  describeDiplomacyTermsForRecipient,
  netValueToAi,
  recurringCoinHasSlot,
  recurringCoinTermHours,
  DiplomacyTermsSchema,
  emptyDiplomacyTerms,
  evaluateAiOffer,
  swapDiplomacyTerms,
  type AiDiplomacyPricing,
  type DiplomacyTerms
} from "./diplomacy-terms.js";
import { ClientMessageSchema } from "../messages/messages.js";
import { evaluateResourceTradeOffer } from "../resource-supply-trades/resource-trade-offers.js";

const pricing = (truce12: number | null, alliance: number | null = null, aiHoldings = { gold: 100 }): AiDiplomacyPricing => ({
  required: { truce12, truce24: truce12 === null ? null : truce12 * 2, alliance },
  aiHoldings
});

const terms = (giveGold: number, askGold = 0): DiplomacyTerms => ({
  give: { gold: giveGold },
  ask: { gold: askGold }
});

describe("evaluateAiOffer", () => {
  it("accepts once the offer covers the AI's price", () => {
    expect(evaluateAiOffer(pricing(60), "truce", 12, terms(60))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(60), "truce", 12, terms(40))).toEqual({ accepts: false, reason: "shortfall", shortfall: 20 });
  });

  it("prices 24h truces and alliances separately", () => {
    expect(evaluateAiOffer(pricing(60), "truce", 24, terms(60))).toEqual({ accepts: false, reason: "shortfall", shortfall: 60 });
    expect(evaluateAiOffer(pricing(60, 0), "alliance", 12, emptyDiplomacyTerms())).toEqual({ accepts: true });
  });

  it("lets a willing AI pay, but never more than it has", () => {
    expect(evaluateAiOffer(pricing(-50), "truce", 12, terms(0, 50))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(-500), "truce", 12, terms(0, 150))).toEqual({
      accepts: false,
      reason: "aiCannotPay",
      missing: { gold: 50 }
    });
  });

  it("refuses at any price when the AI won't deal", () => {
    expect(evaluateAiOffer(pricing(null), "truce", 12, terms(10_000))).toEqual({ accepts: false, reason: "refuses" });
  });
});

describe("alliances", () => {
  // The AI never pays to join an alliance.
  it("refuses any alliance offer that asks the AI for something, and never prices one below free", () => {
    expect(evaluateAiOffer(pricing(0, -500), "alliance", 12, terms(0, 10))).toEqual({ accepts: false, reason: "aiWontPay" });
    expect(evaluateAiOffer(pricing(0, -500), "alliance", 12, emptyDiplomacyTerms())).toEqual({ accepts: true });
    expect(aiCounterOffer(pricing(0, 40), "alliance", 12, terms(0, 30), { gold: 100 })).toEqual({ kind: "counter", terms: terms(40) });
  });
});

describe("aiCounterOffer", () => {
  it("asks for exactly the missing coin when the requester has it", () => {
    expect(aiCounterOffer(pricing(60), "truce", 12, terms(20), { gold: 500 })).toEqual({ kind: "counter", terms: terms(60) });
  });

  // The user's rule: a player with 10 coin can't be asked for 200.
  it("never asks for more than the requester holds; says how short they are instead", () => {
    expect(aiCounterOffer(pricing(200), "truce", 12, emptyDiplomacyTerms(), { gold: 10 })).toEqual({ kind: "cannotAfford", shortfall: 190 });
  });

  it("drops what the requester asked for before asking them to pay more", () => {
    expect(aiCounterOffer(pricing(0), "truce", 12, terms(0, 30), { gold: 0 })).toEqual({ kind: "counter", terms: terms(0) });
  });

  it("keeps a counter within what the AI itself can pay", () => {
    const result = aiCounterOffer(pricing(-500, null, { gold: 100 }), "truce", 12, terms(0, 300), { gold: 0 });
    expect(result).toEqual({ kind: "counter", terms: terms(0, 100) });
  });

  it("does not counter an AI that refuses outright", () => {
    expect(aiCounterOffer(pricing(null), "truce", 12, emptyDiplomacyTerms(), { gold: 1_000 })).toEqual({ kind: "refuses" });
  });
});

describe("terms helpers", () => {
  it("swaps sides and describes a deal from the recipient's point of view", () => {
    const offer = terms(50, 20);
    expect(swapDiplomacyTerms(offer)).toEqual(terms(20, 50));
    expect(describeDiplomacyTermsForRecipient(offer, "Beejac")).toBe("Beejac pays 50 coin; you pay 20 coin");
    expect(describeDiplomacyTermsForRecipient(emptyDiplomacyTerms(), "Beejac")).toBe("");
  });

  // An AI food sale read "you pay 4 coin" next to a supply line, which looked like 4 coin per hour.
  it("labels upfront coin as a lump sum when the deal also has continuing supply", () => {
    const sale = { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 4 } };
    expect(describeDiplomacyTermsForRecipient(sale, "Milo")).toBe("Milo pays 1 FOOD supply slot; you pay 4 coin lump sum. Supply lasts 7 days from acceptance.");
    expect(describeDiplomacyTermsForProposer(sale, "Ana")).toContain("Ana pays 4 coin lump sum");
  });

  it("rejects negative, fractional and absurd amounts on the wire", () => {
    expect(DiplomacyTermsSchema.safeParse(terms(-1)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(1.5)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(2_000_000)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(5, 1)).success).toBe(true);
  });
});

// Regression: an AI refused any Coin per hour, so a truce couldn't be paid for from future income.
describe("Coin per hour in AI deals", () => {
  const pledge = (coinPerHour: number): DiplomacyTerms => ({ give: { gold: 0, coinPerHour }, ask: { gold: 0 } });
  const earning = (truce12: number, spare: number): AiDiplomacyPricing => ({ ...pricing(truce12), requesterSpareCoinPerHour: spare });
  it("values a truce pledge over the truce's hours at a discount", () => {
    expect(recurringCoinTermHours("truce", 12, pledge(10))).toBe(12);
    expect(netValueToAi(pledge(10), 12)).toBe(10 * 12 * AI_RECURRING_COIN_VALUE_SHARE);
    expect(evaluateAiOffer(earning(60, 100), "truce", 12, pledge(10))).toEqual({ accepts: true });
    expect(evaluateAiOffer(earning(60, 100), "truce", 12, pledge(5))).toEqual({ accepts: false, reason: "shortfall", shortfall: 30 });
  });
  // Review regression: a 1,000,000/h pledge from a House earning 20/h bought any truce for ~240 Coin of real payments.
  it("counts a pledge only up to the requester's spare income, and none when unread", () => {
    expect(evaluateAiOffer(earning(600, 20), "truce", 12, pledge(1_000_000))).toEqual({ accepts: false, reason: "shortfall", shortfall: 480 });
    expect(evaluateAiOffer(pricing(60), "truce", 12, pledge(10))).toEqual({ accepts: false, reason: "shortfall", shortfall: 60 });
  });
  it("never pledges its own income, and takes a pledge only for a truce", () => {
    expect(evaluateAiOffer(pricing(-50), "truce", 12, { give: { gold: 0 }, ask: { gold: 0, coinPerHour: 1 } })).toEqual({ accepts: false, reason: "refuses" });
    expect(evaluateAiOffer(pricing(0, 0), "alliance", 12, pledge(10))).toEqual({ accepts: false, reason: "refuses" });
    expect(aiCounterOffer(earning(60, 100), "truce", 12, pledge(5), { gold: 100 })).toEqual({ kind: "counter", terms: { give: { gold: 30, coinPerHour: 5 }, ask: { gold: 0 } } });
  });
  // Playtest 2026-11-19: a House earning 11.5 coin/day with 7 coin was told a truce was "3 coin more
  // than you can offer" though the AI takes Coin per hour; the counter never asked for it.
  it("counters with Coin per hour from spare income when lump-sum coin isn't enough", () => {
    expect(aiCounterOffer(earning(60, 100), "truce", 12, emptyDiplomacyTerms(), { gold: 10 }))
      .toEqual({ kind: "counter", terms: { give: { gold: 10, coinPerHour: 9 }, ask: { gold: 0 } } });
    // Only spare income counts: with 2 coin/hour spare it still falls short.
    expect(aiCounterOffer(earning(60, 2), "truce", 12, emptyDiplomacyTerms(), { gold: 10 })).toEqual({ kind: "cannotAfford", shortfall: 38 });
    // Never for an alliance.
    expect(aiCounterOffer({ ...pricing(0, 60), requesterSpareCoinPerHour: 100 }, "alliance", 12, emptyDiplomacyTerms(), { gold: 10 }))
      .toEqual({ kind: "cannotAfford", shortfall: 50 });
  });
  it("lets a truce carry Coin per hour without a slot, but not an alliance or trade", () => {
    expect(DiplomacyTermsSchema.safeParse(pledge(10)).success).toBe(true);
    expect(recurringCoinHasSlot(pledge(10))).toBe(false);
    expect(recurringCoinTermHours("alliance", 12, pledge(10))).toBeNull();
    const request = (type: "TRUCE_REQUEST" | "ALLIANCE_REQUEST" | "RESOURCE_TRADE_REQUEST") =>
      ClientMessageSchema.safeParse({ type, targetPlayerName: "Elin", durationHours: 12, terms: pledge(10) }).success;
    expect([request("TRUCE_REQUEST"), request("ALLIANCE_REQUEST"), request("RESOURCE_TRADE_REQUEST")]).toEqual([true, false, false]);
    expect(recurringCoinTermHours("trade", 12, { ...pledge(10), ask: { gold: 0, resources: { FOOD: 1 } } })).toBe(7 * 24);
    // Review regression: an independent trade with an AI took Coin per hour (valued over 168h) despite the truce-only rule.
    expect(evaluateResourceTradeOffer({ ...pledge(1000), ask: { gold: 0, resources: { FOOD: 1 } } }, { gold: 0, resources: { FOOD: 5 } })).toEqual({ accepts: false, reason: "refuses" });
  });
});
