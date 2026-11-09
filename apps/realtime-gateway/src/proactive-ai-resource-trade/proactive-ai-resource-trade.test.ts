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

  it("asks for nothing with no FOOD demand at all (0/0)", () => {
    expect(foodSlotsWanted({ resourceSlots: slots(0, 0) })).toBe(0);
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
    expect(terms).toEqual({ give: { gold: 0, resources: { UMBRITE: 3 } }, ask: { gold: 0, resources: { FOOD: 3 } }});
  });

  it("falls back to coin worth a day of the FOOD", () => {
    expect(foodTradeTerms(2, { gold: 100 })).toEqual({ give: { gold: 8 }, ask: { gold: 0, resources: { FOOD: 2 } }});
  });

  it("never pledges a producing network site as payment", () => {
    expect(foodTradeTerms(1, { gold: 0, resourceTradeHoldings: { NEURAL_RESIN: 5 } })).toBeUndefined();
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

type Harness = { deps: ProactiveAiResourceTradeDeps; cancels: Array<{ from: string; agreementId: string }>; requests: Array<{ from: string; to: string; terms: DiplomacyTerms; ttlMs?: number | undefined }> };

const harness = (players: Record<string, TradePlayerState>, options: { pending?: number; humanNeighbour?: string } = {}): Harness => {
  const requests: Harness["requests"] = [];
  const cancels: Harness["cancels"] = [];
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
      request: async (from, to, terms, opts) => { requests.push({ from, to, terms, ...(opts?.ttlMs ? { ttlMs: opts.ttlMs } : {}) }); return { ok: true, offerId: "offer-1" }; }
    },
    cancelSupply: async (from, agreementId) => { cancels.push({ from, agreementId }); return { ok: true }; },
    recordEvent: () => undefined,
    now: () => 1_000
  };
  return { deps, requests, cancels };
};

describe("createProactiveAiResourceTrade", () => {
  const hungry: TradePlayerState = { gold: 100, resourceSlots: slots(10, 10) };
  const rich: TradePlayerState = { gold: 0, resourceSlots: slots(360, 216), resourceTradeHoldings: { FOOD: 144 } };

  it("asks another AI with spare FOOD when out of FOOD", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": rich });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([{ from: "ai-1", to: "ai-2", terms: { give: { gold: 4 }, ask: { gold: 0, resources: { FOOD: 1 } }} }]);
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
    expect(requests[0]?.ttlMs).toBe(3_600_000);
  });

  it("still reaches a human neighbour when many AIs have no spare FOOD", async () => {
    const players: Record<string, TradePlayerState> = { "ai-1": hungry, human: rich };
    for (let i = 2; i <= 9; i += 1) players[`ai-${i}`] = { resourceTradeHoldings: { FOOD: 0 } };
    const { deps, requests } = harness(players, { humanNeighbour: "human" });
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests.map(r => r.to)).toEqual(["human"]);
  });

  it("ends its own FOOD purchase once the paid-for day has passed, before asking again", async () => {
    const day = 24 * 3_600_000;
    const deal = { id: "deal-1", proposerId: "ai-1", targetId: "ai-2", proposerGives: {}, targetGives: { FOOD: 1 }, startedAt: 0, fulfilled: true };
    const { deps, requests, cancels } = harness({ "ai-1": { ...hungry, resourceTradeAgreements: [deal] }, "ai-2": rich });
    deps.now = () => day - 1;
    await createProactiveAiResourceTrade(deps).tick();
    expect(cancels).toEqual([]);
    deps.now = () => day;
    await createProactiveAiResourceTrade(deps).tick();
    expect(cancels).toEqual([{ from: "ai-1", agreementId: "deal-1" }]);
    expect(requests.length).toBe(1); // only the first tick's ask
  });

  it("never ends a deal another House proposed", async () => {
    const deal = { id: "deal-2", proposerId: "human", targetId: "ai-1", proposerGives: { FOOD: 2 }, targetGives: {}, startedAt: 0, fulfilled: true };
    const { deps, cancels } = harness({ "ai-1": { ...hungry, resourceTradeAgreements: [deal] }, "ai-2": rich });
    deps.now = () => 10 * 24 * 3_600_000;
    await createProactiveAiResourceTrade(deps).tick();
    expect(cancels).toEqual([]);
  });

  it("never trades for an AI a human took over mid-tick", async () => {
    const { deps, requests } = harness({ "ai-1": hungry, "ai-2": rich });
    let claimed = false;
    deps.hasLiveSocket = id => id === "ai-1" && claimed;
    deps.playerState = async () => { claimed = true; return rich; };
    await createProactiveAiResourceTrade(deps).tick();
    expect(requests).toEqual([]);
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
