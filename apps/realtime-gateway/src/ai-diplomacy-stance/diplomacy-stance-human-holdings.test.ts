import { afterEach, describe, expect, it, vi } from "vitest";
import { answerDiplomacyStanceQuery, HUMAN_HOLDINGS_TIMEOUT_MS, tradeHoldingsOf, type DiplomacyStanceQueryDeps } from "./diplomacy-stance-query.js";

// Playtest 2026-11-17: countering a human's offer showed no amounts on their
// side, so there was no way to know what to ask for. The stance reply now
// carries a human's coin and spare supply, as it already did for an AI --
// online or offline alike, so the reply never reveals who is logged in.
const deps = (humanHoldings: DiplomacyStanceQueryDeps["humanHoldings"]): DiplomacyStanceQueryDeps => ({
  resolvePlayerByName: name => (name === "Konrad" ? { id: "p2", name: "Konrad" } : undefined),
  isAutoRespondingAi: () => false,
  fetchAiSnapshot: async () => undefined,
  requesterSnapshot: async () => undefined,
  diplomacyContext: () => { throw new Error("not used for a human target"); },
  ...(humanHoldings ? { humanHoldings } : {})
});

afterEach(() => { vi.useRealTimers(); });

describe("stance reply: a human target's holdings", () => {
  it("carries the human's coin and spare supply", async () => {
    const reply = await answerDiplomacyStanceQuery(deps(async () => tradeHoldingsOf({ gold: 120.7, resourceTradeHoldings: { FOOD: 3 } })), "p1", "Konrad");
    expect(reply).toMatchObject({ found: true, ai: false, holdings: { gold: 120, resources: { FOOD: 3 } } });
  });
  it("drops the amounts, not the reply, when the lookup fails", async () => {
    const reply = await answerDiplomacyStanceQuery(deps(async () => { throw new Error("simulation unavailable"); }), "p1", "Konrad");
    expect(reply).toMatchObject({ found: true, ai: false });
    expect(reply).not.toHaveProperty("holdings");
  });
  it("answers without amounts when the lookup is too slow", async () => {
    vi.useFakeTimers();
    const pending = answerDiplomacyStanceQuery(deps(() => new Promise(() => {})), "p1", "Konrad");
    await vi.advanceTimersByTimeAsync(HUMAN_HOLDINGS_TIMEOUT_MS);
    const reply = await pending;
    expect(reply).toMatchObject({ found: true, ai: false });
    expect(reply).not.toHaveProperty("holdings");
  });
});
