import { describe, expect, it } from "vitest";
import type { DiplomacyTerms, ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { createProactiveAiResourceTrade, type ProactiveAiResourceTradeDeps, type TradePlayerState } from "./proactive-ai-resource-trade.js";

// Playtest 2026-11-16: AI Houses offered supply deals that could only fail at
// accept ("Too many active resource agreements"). An AI now skips a House at
// its limit, and stops offering once it is full itself.
const slots = (supply: number, demand: number) => ({ supply: { FOOD: supply }, demand: { FOOD: demand } }) as unknown as TradePlayerState["resourceSlots"];
const full = (id: string): ResourceSupplyAgreementStatus[] => Array.from({ length: 16 }, (_, i) => ({
  id: `${id}-${i}`, proposerId: id, targetId: `other-${i}`, proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 0, expiresAt: 10_000, fulfilled: true
}));
const run = async (players: Record<string, TradePlayerState>) => {
  const requests: Array<{ to: string; terms: DiplomacyTerms }> = [];
  const deps: ProactiveAiResourceTradeDeps = {
    aiPlayerIds: new Set(Object.keys(players)), hasLiveSocket: () => false,
    fetchAiSnapshot: async id => ({ tiles: [], player: players[id] }), playerState: async id => players[id],
    trades: { outgoingOfferCount: () => 0, request: async (_from, to, terms) => { requests.push({ to, terms }); return { ok: true, offerId: "o" }; } },
    recentlyFought: () => false, cancelSupply: async () => ({ ok: true }), recordEvent: () => undefined, now: () => 1_000
  };
  await createProactiveAiResourceTrade(deps).tick();
  return requests;
};
describe("AI supply offers respect the agreement limit", () => {
  const hungry: TradePlayerState = { gold: 100, resourceSlots: slots(10, 10) };
  const rich: TradePlayerState = { gold: 0, resourceSlots: slots(360, 216), resourceTradeHoldings: { FOOD: 144 } };
  it("skips a seller that is at its limit", async () => {
    expect(await run({ "ai-1": hungry, "ai-2": { ...rich, resourceTradeAgreements: full("ai-2") }, "ai-3": rich })).toEqual([expect.objectContaining({ to: "ai-3" })]);
  });
  it("makes no offer while it is at its own limit", async () => {
    expect(await run({ "ai-1": { ...hungry, resourceTradeAgreements: full("ai-1") }, "ai-2": rich })).toEqual([]);
  });
  it("ignores agreements that have already run out", async () => {
    const expired = full("ai-2").map(row => ({ ...row, expiresAt: 500 }));
    expect(await run({ "ai-1": hungry, "ai-2": { ...rich, resourceTradeAgreements: expired } })).toHaveLength(1);
  });
});
