import { describe, expect, it } from "vitest";

import {
  aiCounterOffer,
  describeDiplomacyTermsForProposer,
  describeDiplomacyTermsForRecipient,
  diplomacyTermsAreEmpty,
  DiplomacyTermsSchema,
  evaluateAiOffer,
  swapDiplomacyTerms,
  type AiDiplomacyPricing,
  type DiplomacyTerms
} from "./diplomacy-terms.js";
import { MAX_TOWNS_PER_DEAL, townsToCover } from "./diplomacy-town-return.js";
import { ClientMessageSchema } from "../messages/messages.js";

const oak = { x: 10, y: 20 };
const elm = { x: 30, y: 40 };
const pricing = (overrides: Partial<AiDiplomacyPricing> = {}): AiDiplomacyPricing => ({
  required: { truce12: 100, truce24: 150, alliance: null },
  aiHoldings: { gold: 0 },
  townValues: [{ ...oak, value: 80 }, { ...elm, value: 200 }],
  ...overrides
});
const terms = (give: DiplomacyTerms["give"], ask: DiplomacyTerms["ask"] = { gold: 0 }): DiplomacyTerms => ({ give, ask });

describe("town return terms", () => {
  it("parses a town list but rejects duplicates and more than the cap", () => {
    expect(DiplomacyTermsSchema.safeParse(terms({ gold: 0, towns: [oak] })).success).toBe(true);
    expect(DiplomacyTermsSchema.safeParse(terms({ gold: 0, towns: [oak, { ...oak }] })).success).toBe(false);
    const many = Array.from({ length: MAX_TOWNS_PER_DEAL + 1 }, (_, i) => ({ x: i, y: i }));
    expect(DiplomacyTermsSchema.safeParse(terms({ gold: 0, towns: many })).success).toBe(false);
  });

  it("allows towns in a truce and a gift, never in an alliance or a resource trade", () => {
    const withTown = terms({ gold: 0, towns: [oak] });
    expect(ClientMessageSchema.safeParse({ type: "TRUCE_REQUEST", targetPlayerName: "Milo", durationHours: 12, terms: withTown }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "DIPLOMACY_GIFT", targetPlayerName: "Milo", gift: { gold: 0, towns: [oak] } }).success).toBe(true);
    expect(ClientMessageSchema.safeParse({ type: "ALLIANCE_REQUEST", targetPlayerName: "Milo", terms: withTown }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: "RESOURCE_TRADE_REQUEST", targetPlayerName: "Milo", terms: terms({ gold: 0, towns: [oak], resources: { FOOD: 1 } }) }).success).toBe(false);
  });

  it("counts a town-only deal as a deal, and swaps towns to the other side", () => {
    const deal = terms({ gold: 0, towns: [oak] });
    expect(diplomacyTermsAreEmpty(deal)).toBe(false);
    const swapped = swapDiplomacyTerms(deal);
    expect(swapped.ask.towns).toEqual([oak]);
    expect(swapped.give.towns).toBeUndefined();
    expect(swapped.ask.towns).not.toBe(deal.give.towns);
  });

  it("describes the return from both sides, by name when known", () => {
    const deal = terms({ gold: 0, towns: [oak] }, { gold: 5 });
    const name = () => "Oakridge";
    expect(describeDiplomacyTermsForProposer(deal, "Milo", name)).toBe("you offer the return of Oakridge (10, 20); Milo pays 5 coin");
    expect(describeDiplomacyTermsForRecipient(deal, "Beejac")).toBe("Beejac offers the return of the town at (10, 20); you pay 5 coin");
  });
});

describe("AI valuation of returned towns", () => {
  it("counts its own lost town toward the price, and nothing for a town it doesn't know", () => {
    expect(evaluateAiOffer(pricing(), "truce", 12, terms({ gold: 20, towns: [oak] }))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(), "truce", 12, terms({ gold: 20, towns: [{ x: 1, y: 1 }] }))).toEqual({ accepts: false, reason: "shortfall", shortfall: 80 });
  });

  it("sells a truce it would refuse while it can retake land, but only for a town back", () => {
    const retaking = pricing({ required: { truce12: null, truce24: null, alliance: null }, townReturn: { truce12: 60, truce24: 90 } });
    expect(evaluateAiOffer(retaking, "truce", 12, terms({ gold: 500 }))).toEqual({ accepts: false, reason: "refuses" });
    expect(evaluateAiOffer(retaking, "truce", 12, terms({ gold: 0, towns: [oak] }))).toEqual({ accepts: true });
    expect(evaluateAiOffer(retaking, "truce", 24, terms({ gold: 0, towns: [oak] }))).toEqual({ accepts: false, reason: "shortfall", shortfall: 10 });
  });

  it("never gives a town away, and takes none in an alliance", () => {
    expect(evaluateAiOffer(pricing(), "truce", 12, terms({ gold: 500 }, { gold: 0, towns: [oak] }))).toEqual({ accepts: false, reason: "refuses" });
    const ally = pricing({ required: { truce12: 0, truce24: 0, alliance: 0 } });
    expect(evaluateAiOffer(ally, "alliance", 12, terms({ gold: 0, towns: [oak] }))).toEqual({ accepts: false, reason: "refuses" });
  });
});

describe("AI counter-offers with towns", () => {
  it("asks for a town once coin, supply and coin per hour can't cover the price", () => {
    const counter = aiCounterOffer(pricing(), "truce", 12, terms({ gold: 0 }), { gold: 30 });
    expect(counter).toEqual({ kind: "counter", terms: { give: { gold: 30, towns: [oak] }, ask: { gold: 0 } } });
  });

  it("names a town first when only a town lifts its refusal", () => {
    const retaking = pricing({ required: { truce12: null, truce24: null, alliance: null }, townReturn: { truce12: 120, truce24: 180 } });
    const counter = aiCounterOffer(retaking, "truce", 12, terms({ gold: 0 }), { gold: 1_000 });
    expect(counter).toEqual({ kind: "counter", terms: { give: { gold: 0, towns: [elm] }, ask: { gold: 0 } } });
    const cheap = pricing({ required: { truce12: null, truce24: null, alliance: null }, townReturn: { truce12: 50, truce24: 75 } });
    expect(aiCounterOffer(cheap, "truce", 12, terms({ gold: 0 }), { gold: 0 })).toEqual({ kind: "counter", terms: { give: { gold: 0, towns: [oak] }, ask: { gold: 0 } } });
  });

  it("still refuses a retake truce when no town is returnable", () => {
    const retaking = pricing({ required: { truce12: null, truce24: null, alliance: null }, townReturn: { truce12: 60, truce24: 90 }, townValues: [] });
    expect(aiCounterOffer(retaking, "truce", 12, terms({ gold: 0 }), { gold: 1_000 })).toEqual({ kind: "refuses" });
  });

  it("picks the cheapest town that covers the gap, else the largest and repeats", () => {
    const priced = [{ ...oak, value: 80 }, { ...elm, value: 200 }, { x: 5, y: 5, value: 30 }];
    expect(townsToCover(priced, [], 50, false)).toEqual([{ ...oak, value: 80 }]);
    expect(townsToCover(priced, [], 250, false)).toEqual([{ ...elm, value: 200 }, { ...oak, value: 80 }]);
    expect(townsToCover(priced, [elm], 0, true)).toEqual([{ x: 5, y: 5, value: 30 }]);
  });
});
