import { describe, expect, it } from "vitest";
import { answerDiplomacyStanceQuery, tradeHoldingsOf, type DiplomacyStanceQueryDeps } from "./diplomacy-stance-query.js";

// Playtest 2026-11-17: countering a human's offer showed no amounts on their
// side, so there was no way to know what to ask for. The stance reply now
// carries an online human's coin and spare supply, as it already did for an AI.
const deps = (live: Record<string, { gold: number; resourceTradeHoldings?: { FOOD?: number } }>): DiplomacyStanceQueryDeps => ({
  resolvePlayerByName: name => (name === "Konrad" ? { id: "p2", name: "Konrad" } : undefined),
  isAutoRespondingAi: () => false,
  fetchAiSnapshot: async () => undefined,
  requesterSnapshot: async () => undefined,
  diplomacyContext: () => { throw new Error("not used for a human target"); },
  liveHoldings: id => (live[id] ? tradeHoldingsOf(live[id]) : undefined)
});

describe("stance reply: a human target's holdings", () => {
  it("carries an online human's coin and spare supply", async () => {
    const reply = await answerDiplomacyStanceQuery(deps({ p2: { gold: 120.7, resourceTradeHoldings: { FOOD: 3 } } }), "p1", "Konrad");
    expect(reply).toMatchObject({ found: true, ai: false, holdings: { gold: 120, resources: { FOOD: 3 } } });
  });
  it("omits holdings for an offline human", async () => {
    expect(await answerDiplomacyStanceQuery(deps({}), "p1", "Konrad")).not.toHaveProperty("holdings");
  });
});
