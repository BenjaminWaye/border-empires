import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { aiDiplomacyPricing } from "./ai-diplomacy-pricing.js";
import { answerDiplomacyStanceQuery } from "./diplomacy-stance-query.js";

describe("aiDiplomacyPricing", () => {
  it("prices offers in minutes of the AI's income", () => {
    expect(aiDiplomacyPricing({ stanceKind: "WARY", acceptsAllianceFree: false, incomePerMinute: 3, aiHoldings: { gold: 10.7, shard: 1 } })).toEqual({
      required: { truce12: 60, truce24: 90, alliance: 180 },
      shardCoinValue: 25,
      aiHoldings: { gold: 10, shard: 1 }
    });
  });

  it("matches the stance's no-terms answers: free when it accepts, a price or refusal when it doesn't", () => {
    const winning = aiDiplomacyPricing({ stanceKind: "WINNING", acceptsAllianceFree: false, incomePerMinute: 1, aiHoldings: { gold: 0, shard: 0 } });
    expect(winning.required.alliance).toBeNull();
    expect(winning.required.truce12).toBeGreaterThan(0);
    const outmatched = aiDiplomacyPricing({ stanceKind: "OUTMATCHED", acceptsAllianceFree: true, incomePerMinute: 1, aiHoldings: { gold: 0, shard: 0 } });
    expect(outmatched.required.truce12).toBeLessThan(0);
    expect(outmatched.required.alliance).toBe(0);
    const desperate = aiDiplomacyPricing({ stanceKind: "SEEKING_PEACE", acceptsAllianceFree: true, incomePerMinute: 1, aiHoldings: { gold: 0, shard: 0 } });
    expect(desperate.required.alliance).toBe(0);
  });

  it("floors income so a broke AI still has a price", () => {
    expect(aiDiplomacyPricing({ stanceKind: "WARY", acceptsAllianceFree: false, incomePerMinute: 0, aiHoldings: { gold: 0, shard: 0 } }).required.truce12).toBe(20);
  });
});

describe("answerDiplomacyStanceQuery", () => {
  const aiSnapshot = {
    playerId: "ai-1",
    tiles: [],
    player: { manpower: 800, manpowerCap: 1000, gold: 40, incomePerMinute: 2, strategicResources: { SHARD: 1 } }
  } as unknown as PlayerSubscriptionSnapshot;
  const deps = {
    resolvePlayerByName: (name: string) => (name === "Milo" ? { id: "ai-1", name: "Milo" } : name === "Valka" ? { id: "p2", name: "Valka" } : undefined),
    isAutoRespondingAi: (id: string) => id === "ai-1",
    fetchAiSnapshot: async () => aiSnapshot,
    requesterSnapshot: async () => undefined,
    requesterBrokeTruceWith: () => false
  };

  it("returns an AI's stance and prices", async () => {
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Milo")).toEqual({
      type: "DIPLOMACY_STANCE",
      targetPlayerName: "Milo",
      found: true,
      targetPlayerId: "ai-1",
      ai: true,
      stance: { kind: "INDIFFERENT", reason: "Milo has no quarrel with you: your borders don't meet." },
      pricing: { required: { truce12: 0, truce24: 0, alliance: 60 }, shardCoinValue: 25, aiHoldings: { gold: 40, shard: 1 } }
    });
  });

  it("has nothing to predict for humans, unknown names, or yourself", async () => {
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Valka")).toEqual(expect.objectContaining({ found: true, ai: false }));
    expect(await answerDiplomacyStanceQuery(deps, "p1", "Nobody")).toEqual(expect.objectContaining({ found: false }));
    expect(await answerDiplomacyStanceQuery(deps, "ai-1", "Milo")).toEqual(expect.objectContaining({ found: false }));
  });

  it("answers without a stance when the AI can't be read", async () => {
    const result = await answerDiplomacyStanceQuery({ ...deps, fetchAiSnapshot: async () => undefined }, "p1", "Milo");
    expect(result).toEqual(expect.objectContaining({ found: true, ai: true }));
    expect(result).not.toHaveProperty("stance");
  });
});
