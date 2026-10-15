import { describe, expect, it } from "vitest";

import {
  aiCounterOffer,
  describeDiplomacyTermsForRecipient,
  DiplomacyTermsSchema,
  emptyDiplomacyTerms,
  evaluateAiOffer,
  swapDiplomacyTerms,
  type AiDiplomacyPricing,
  type DiplomacyTerms
} from "./diplomacy-terms.js";

const pricing = (truce12: number | null, alliance: number | null = null, aiHoldings = { gold: 100, shard: 2 }): AiDiplomacyPricing => ({
  required: { truce12, truce24: truce12 === null ? null : truce12 * 2, alliance },
  shardCoinValue: 25,
  aiHoldings
});

const terms = (giveGold: number, giveShard = 0, askGold = 0, askShard = 0): DiplomacyTerms => ({
  give: { gold: giveGold, shard: giveShard },
  ask: { gold: askGold, shard: askShard }
});

describe("evaluateAiOffer", () => {
  it("accepts once the offer covers the AI's price, counting Shards at their coin value", () => {
    expect(evaluateAiOffer(pricing(60), "truce", 12, terms(60))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(60), "truce", 12, terms(10, 2))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(60), "truce", 12, terms(40))).toEqual({ accepts: false, reason: "shortfall", shortfall: 20 });
  });

  it("prices 24h truces and alliances separately", () => {
    expect(evaluateAiOffer(pricing(60), "truce", 24, terms(60))).toEqual({ accepts: false, reason: "shortfall", shortfall: 60 });
    expect(evaluateAiOffer(pricing(60, 0), "alliance", 12, emptyDiplomacyTerms())).toEqual({ accepts: true });
  });

  it("lets a willing AI pay, but never more than it has", () => {
    expect(evaluateAiOffer(pricing(-50), "truce", 12, terms(0, 0, 50))).toEqual({ accepts: true });
    expect(evaluateAiOffer(pricing(-500), "truce", 12, terms(0, 0, 150))).toEqual({
      accepts: false,
      reason: "aiCannotPay",
      missing: { gold: 50, shard: 0 }
    });
  });

  it("refuses at any price when the AI won't deal", () => {
    expect(evaluateAiOffer(pricing(null), "truce", 12, terms(10_000))).toEqual({ accepts: false, reason: "refuses" });
  });
});

describe("aiCounterOffer", () => {
  it("asks for exactly the missing coin when the requester has it", () => {
    expect(aiCounterOffer(pricing(60), "truce", 12, terms(20), { gold: 500, shard: 0 })).toEqual({ kind: "counter", terms: terms(60) });
  });

  // The user's rule: a player with 10 coin can't be asked for 200.
  it("never asks for more than the requester holds; says how short they are instead", () => {
    expect(aiCounterOffer(pricing(200), "truce", 12, emptyDiplomacyTerms(), { gold: 10, shard: 0 })).toEqual({ kind: "cannotAfford", shortfall: 190 });
  });

  it("drops what the requester asked for before asking them to pay more", () => {
    expect(aiCounterOffer(pricing(0), "truce", 12, terms(0, 0, 30), { gold: 0, shard: 0 })).toEqual({ kind: "counter", terms: terms(0) });
  });

  it("tops up with Shards once the requester's coin runs out", () => {
    expect(aiCounterOffer(pricing(60), "truce", 12, emptyDiplomacyTerms(), { gold: 20, shard: 5 })).toEqual({ kind: "counter", terms: terms(20, 2) });
  });

  it("keeps a counter within what the AI itself can pay", () => {
    const result = aiCounterOffer(pricing(-500, null, { gold: 100, shard: 0 }), "truce", 12, terms(0, 0, 300), { gold: 0, shard: 0 });
    expect(result).toEqual({ kind: "counter", terms: terms(0, 0, 100) });
  });

  it("does not counter an AI that refuses outright", () => {
    expect(aiCounterOffer(pricing(null), "truce", 12, emptyDiplomacyTerms(), { gold: 1_000, shard: 0 })).toEqual({ kind: "refuses" });
  });
});

describe("terms helpers", () => {
  it("swaps sides and describes a deal from the recipient's point of view", () => {
    const offer = terms(50, 0, 0, 2);
    expect(swapDiplomacyTerms(offer)).toEqual(terms(0, 2, 50, 0));
    expect(describeDiplomacyTermsForRecipient(offer, "Beejac")).toBe("Beejac pays 50 coin; you pay 2 Shards");
    expect(describeDiplomacyTermsForRecipient(emptyDiplomacyTerms(), "Beejac")).toBe("");
  });

  it("rejects negative, fractional and absurd amounts on the wire", () => {
    expect(DiplomacyTermsSchema.safeParse(terms(-1)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(1.5)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(2_000_000)).success).toBe(false);
    expect(DiplomacyTermsSchema.safeParse(terms(5, 1, 0, 0)).success).toBe(true);
  });
});
