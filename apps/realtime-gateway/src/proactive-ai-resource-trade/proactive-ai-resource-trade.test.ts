import { describe, expect, it } from "vitest";
import { evaluateResourceTradeOffer, type DiplomacyTerms } from "@border-empires/shared";
import {
  createProactiveAiResourceTrade,
  foodSlotsWanted,
  foodTradeTerms,
  MAX_AI_FOOD_ASK,
  type ProactiveAiResourceTradeDeps,
  type TradePlayerState
} from "./proactive-ai-resource-trade.js";

const slots = (supply: number, demand: number): TradePlayerState["resourceSlots"] => ({
  supply: { FOOD: supply, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
  demand: { FOOD: demand, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
}) as TradePlayerState["resourceSlots"];

describe("foodSlotsWanted", () => {
  it("asks for nothing while FOOD has headroom", () => {
    expect(foodSlotsWanted({ resourceSlots: slots(12, 10) })).toBe(0);
    expect(foodSlotsWanted(undefined)).toBe(0);
  });

  it("asks for one slot at exactly-full FOOD, more in a deficit, capped", () => {
    expect(foodSlotsWanted({ resourceSlots: slots(10, 10) })).toBe(1);
    expect(foodSlotsWanted({ resourceSlots: slots(9, 10) })).toBe(2);
    expect(foodSlotsWanted({ resourceSlots: slots(0, 50) })).toBe(MAX_AI_FOOD_ASK);
  });
});

describe("foodTradeTerms", () => {
  it("pays with a surplus resource worth at least the FOOD", () => {
    // Staging season-41: ai-10 had 30 spare UMBRITE slots and no FOOD.
    const terms = foodTradeTerms(3, { gold: 0, resourceTradeHoldings: { UMBRITE: 30 } });
    expect(terms).toEqual({ give: { gold: 0, resources: { UMBRITE: 3 } }, ask: { gold: 0, resources: { FOOD: 3 } } });
  });

  it("falls back to coin worth a day of the FOOD", () => {
    expect(foodTradeTerms(2, { gold: 100 })).toEqual({ give: { gold: 8 }, ask: { gold: 0, resources: { FOOD: 2 } } });
  });

  it("gives up when it can pay with neither", () => {
    expect(foodTradeTerms(2, { gold: 3 })).toBeUndefined();
    expect(foodTradeTerms(0, { gold: 100 })).toBeUndefined();
  });

  it("is an offer an AI seller with spare FOOD accepts", () => {
    const terms = foodTradeTerms(3, { gold: 0, resourceTradeHoldings: { UMBRITE: 30 } })!;
    expect(evaluateResourceTradeOffer(terms, { gold: 0, resources: { FOOD: 10 } }).accepts).toBe(true);
    expect(evaluateResourceTradeOffer(terms, { gold: 0, resources: { FOOD: 2 } }).accepts).toBe(false);
  });
});

type Harness = { deps: ProactiveAiResourceTradeDeps; requests: Array<{ from: string; to: string; terms: DiplomacyTerms }> };

const harness = (players: Record<string, TradePlayerState>, options: { pending?: number; humanNeighbour?: string } = {}): Harness => {
  const requests: Harness["requests"] = [];
  const deps: ProactiveAiResourceTradeDeps = {
    aiPlayerIds: new Set(Object.keys(players).filter(id => id.startsWith("ai-"))),
    hasLiveSocket: () => false,
    fetchAiSnapshot: async id => ({
      tiles: options.humanNeighbour ? [{ x: 0, y: 0, ownerId: id }, { x: 1, y: 0, ownerId: options.humanNeighbour }] : [],
      player: players[id]
    }),
    playerState: async id => players[id],
    trades: {
      outgoingOfferCount: () => options.pending ?? 0,
      request: async (from, to, terms) => { requests.push({ from, to, terms }); return { ok: true, offerId: "offer-1" }; }
    },
    recordEvent: () => undefined,
    now: () => 1_000
  };
  return { deps, requests };
};

describe("createProactiveAiResourceTrade", () => {
  const hungry: TradePlayerState = { gold: 100, resourceSlots: slots(10, 10) };
  const rich: TradePlayerState = { gold: 0, resourceSlots: slots(360, 216), resourceTradeHoldings: { FOOD: 144 } };

  it("asks another AI with spare FOOD when out of FOOD", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": rich });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([{ from: "ai-1", to: "ai-2", terms: { give: { gold: 4 }, ask: { gold: 0, resources: { FOOD: 1 } } } }]);
  });

  it("does nothing while FOOD has headroom", async () => {
    const { deps, requests } = harness({ "ai-1": { gold: 100, resourceSlots: slots(12, 10) }, "ai-2": rich });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([]);
  });

  it("waits while one of its offers is still pending", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": rich }, { pending: 1 });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([]);
  });

  it("skips Houses without spare FOOD and asks a human neighbour that has some", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": { gold: 0, resourceTradeHoldings: { FOOD: 0 } }, human: rich }, { humanNeighbour: "human" });
    deps.playerState = async id => (id === "human" ? rich : { resourceTradeHoldings: { FOOD: 0 } });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests.map(r => r.to)).toEqual(["human"]);
  });

  it("doesn't ask the same House again within the cooldown", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": rich });
    const loop = createProactiveAiResourceTrade(deps);
    await loop.tick(); // ai-1 asks ai-2
    await loop.tick(); // ai-2's turn: it has headroom
    await loop.tick(); // ai-1 again: ai-2 is on cooldown
    expect(requests.map(r => r.to)).toEqual(["ai-2"]);
  });
});
