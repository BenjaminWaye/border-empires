import { describe, expect, it } from "vitest";
import type { DiplomacyTerms } from "@border-empires/shared";

import { AI_SALE_RESERVE_SLOTS, expiredSurplusSale, RESOURCE_TRADE_AGREEMENT_PREFIX, surplusSaleTerms } from "./ai-surplus-sale.js";
import { createProactiveAiResourceTrade, type ProactiveAiResourceTradeDeps, type TradePlayerState } from "./proactive-ai-resource-trade.js";

const slots = (supply: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>>, demand: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>>) => ({
  supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, ...supply },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, ...demand }
}) as TradePlayerState["resourceSlots"];

// An AI with 10 spare FOOD slots and its own FOOD needs met.
const seller: TradePlayerState = { gold: 0, resourceSlots: slots({ FOOD: 30 }, { FOOD: 20 }), resourceTradeHoldings: { FOOD: 10 } };
// A player 2 FOOD slots short.
const starving: TradePlayerState = { gold: 100, resourceSlots: slots({ FOOD: 3 }, { FOOD: 5 }) };

describe("surplusSaleTerms", () => {
  it("sells a short player spare FOOD for a day's value in coin", () => {
    expect(surplusSaleTerms(seller, starving)).toEqual({ give: { gold: 0, resources: { FOOD: 3 } }, ask: { gold: 12 } });
  });

  it("takes another spare upkeep resource when the buyer is short of coin", () => {
    // 3 FOOD (12/day) for 2 Crystal (6/day each).
    expect(surplusSaleTerms(seller, { ...starving, gold: 5, resourceTradeHoldings: { CRYSTAL: 4 } }))
      .toEqual({ give: { gold: 0, resources: { FOOD: 3 } }, ask: { gold: 0, resources: { CRYSTAL: 2 } } });
  });

  it("keeps a reserve for itself and sells nothing the buyer doesn't need", () => {
    expect(surplusSaleTerms({ ...seller, resourceTradeHoldings: { FOOD: AI_SALE_RESERVE_SLOTS } }, starving)).toBeUndefined();
    expect(surplusSaleTerms({ ...seller, resourceTradeHoldings: { FOOD: AI_SALE_RESERVE_SLOTS + 1 } }, starving))
      .toEqual({ give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 4 } });
    expect(surplusSaleTerms(seller, { gold: 100, resourceSlots: slots({ FOOD: 8 }, { FOOD: 5 }) })).toBeUndefined();
    expect(surplusSaleTerms(seller, { gold: 0, resourceSlots: slots({ FOOD: 3 }, { FOOD: 5 }) })).toBeUndefined();
  });

  it("sells Titanium too", () => {
    const miner: TradePlayerState = { resourceTradeHoldings: { TITANIUM: 9 } };
    expect(surplusSaleTerms(miner, { gold: 50, resourceSlots: slots({ TITANIUM: 1 }, { TITANIUM: 1 }) }))
      .toEqual({ give: { gold: 0, resources: { TITANIUM: 1 } }, ask: { gold: 4 } });
  });
});

describe("expiredSurplusSale", () => {
  const day = 24 * 3_600_000;
  const sale = { id: `${RESOURCE_TRADE_AGREEMENT_PREFIX}offer-1`, proposerId: "ai-1", targetId: "human", proposerGives: { FOOD: 3 }, targetGives: {}, startedAt: 0, fulfilled: true };

  it("ends a sale once the paid-for day has passed", () => {
    expect(expiredSurplusSale("ai-1", { resourceTradeAgreements: [sale] }, day - 1)).toBeUndefined();
    expect(expiredSurplusSale("ai-1", { resourceTradeAgreements: [sale] }, day)).toBe(sale.id);
  });

  it("leaves treaty supply and other Houses' deals alone", () => {
    expect(expiredSurplusSale("ai-1", { resourceTradeAgreements: [{ ...sale, id: "diplomacy-settle:truce:1" }] }, 10 * day)).toBeUndefined();
    expect(expiredSurplusSale("ai-1", { resourceTradeAgreements: [{ ...sale, proposerId: "human", targetId: "ai-1" }] }, 10 * day)).toBeUndefined();
  });
});

// AIs bought FOOD when short but never offered what they had spare to players who ran out.
describe("proactive tick", () => {
  const harness = (players: Record<string, TradePlayerState>, fought = false) => {
    const requests: Array<{ to: string; terms: DiplomacyTerms; ttlMs?: number | undefined }> = [];
    const deps: ProactiveAiResourceTradeDeps = {
      aiPlayerIds: new Set(["ai-1"]),
      hasLiveSocket: () => false,
      fetchAiSnapshot: async id => ({ tiles: [{ x: 0, y: 0, ownerId: id }, { x: 1, y: 0, ownerId: "human" }], player: players[id] }),
      playerState: async id => players[id],
      trades: { outgoingOfferCount: () => 0, request: async (_from, to, terms, opts) => { requests.push({ to, terms, ttlMs: opts?.ttlMs }); return { ok: true, offerId: "o" }; } },
      recentlyFought: () => fought,
      cancelSupply: async () => ({ ok: true }),
      recordEvent: () => undefined,
      now: () => 1_000
    };
    return { deps, requests };
  };

  it("offers a short neighbouring player its spare FOOD, with a short-lived offer", async () => {
    const { deps, requests } = harness({ "ai-1": seller, human: starving });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([{ to: "human", terms: { give: { gold: 0, resources: { FOOD: 3 } }, ask: { gold: 12 } }, ttlMs: 3_600_000 }]);
  });

  it("doesn't sell to a player it is fighting, nor offer again within the cooldown", async () => {
    const fighting = harness({ "ai-1": seller, human: starving }, true);
    await createProactiveAiResourceTrade(fighting.deps).tick();
    expect(fighting.requests).toEqual([]);
    const { deps, requests } = harness({ "ai-1": seller, human: starving });
    const loop = createProactiveAiResourceTrade(deps);
    await loop.tick();
    await loop.tick();
    expect(requests).toHaveLength(1);
  });
});
