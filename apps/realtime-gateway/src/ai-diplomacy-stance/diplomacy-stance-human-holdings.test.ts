import { afterEach, describe, expect, it, vi } from "vitest";
import { answerDiplomacyStanceQuery, HUMAN_TRADE_STATE_TIMEOUT_MS, type DiplomacyStanceQueryDeps } from "./diplomacy-stance-query.js";
import { createHumanTradeState } from "./human-trade-state.js";
import type { PlayerTradeHoldingsResult } from "../sim-client/sim-client-trade-holdings.js";

// Playtest 2026-11-17: countering a human's offer showed no amounts on their
// side, so there was no way to know what to ask for. The stance reply now
// carries a human's coin and spare supply, as it already did for an AI, from
// the simulation whether or not they are online: the reply must never reveal
// who is logged in (amounts, the agreements-full flag, or the source).
const deps = (
  lookup: (id: string) => Promise<PlayerTradeHoldingsResult | undefined>,
  liveCacheCount?: number
): DiplomacyStanceQueryDeps => ({
  resolvePlayerByName: name => (name === "Konrad" ? { id: "p2", name: "Konrad" } : undefined),
  isAutoRespondingAi: () => false,
  fetchAiSnapshot: async () => undefined,
  requesterSnapshot: async () => undefined,
  diplomacyContext: () => { throw new Error("not used for a human target"); },
  // The gateway's live-cache count exists only for online players; it must not leak into a human's reply.
  supplyAgreementCount: async () => liveCacheCount,
  humanTradeState: createHumanTradeState(lookup)
});

const konrad: PlayerTradeHoldingsResult = { gold: 120.7, resourceTradeHoldings: { FOOD: 3 }, activeSupplyAgreements: 16 };

afterEach(() => { vi.useRealTimers(); });

describe("stance reply: a human target's holdings", () => {
  it("carries the human's coin, spare supply and full-agreements flag", async () => {
    const reply = await answerDiplomacyStanceQuery(deps(async () => konrad), "p1", "Konrad");
    expect(reply).toMatchObject({ found: true, ai: false, supplyAgreementsFull: true, holdings: { gold: 120, resources: { FOOD: 3 } } });
  });
  it("answers the same whether or not the target is online", async () => {
    const online = await answerDiplomacyStanceQuery(deps(async () => konrad, 16), "p1", "Konrad");
    const offline = await answerDiplomacyStanceQuery(deps(async () => konrad, undefined), "p1", "Konrad");
    expect(online).toEqual(offline);
  });
  it("drops the amounts and the flag, not the reply, when the lookup fails", async () => {
    const reply = await answerDiplomacyStanceQuery(deps(async () => { throw new Error("simulation unavailable"); }, 16), "p1", "Konrad");
    expect(reply).toMatchObject({ found: true, ai: false });
    expect(reply).not.toHaveProperty("holdings");
    expect(reply).not.toHaveProperty("supplyAgreementsFull");
  });
  it("answers without amounts when the lookup is too slow", async () => {
    vi.useFakeTimers();
    const pending = answerDiplomacyStanceQuery(deps(() => new Promise(() => {})), "p1", "Konrad");
    await vi.advanceTimersByTimeAsync(HUMAN_TRADE_STATE_TIMEOUT_MS);
    const reply = await pending;
    expect(reply).toMatchObject({ found: true, ai: false });
    expect(reply).not.toHaveProperty("holdings");
  });
  it("asks the simulation once per target within the memo window", async () => {
    const lookup = vi.fn(async () => konrad);
    const state = createHumanTradeState(lookup);
    await Promise.all([state("p2"), state("p2")]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
