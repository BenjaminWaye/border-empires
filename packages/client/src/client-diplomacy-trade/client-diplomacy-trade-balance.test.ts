// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateResourceTradeOffer, type AiDiplomacyPricing, type DiplomacyGoods } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "./client-diplomacy-trade.js";
import { balancingAmount, suggestedTradeDeal } from "./client-diplomacy-trade-balance.js";
import type { DiplomacyStanceReply, TradeSelection } from "./client-diplomacy-trade-view.js";

const aiHoldings: DiplomacyGoods = { gold: 50, resources: { TITANIUM: 10, FOOD: 4 } };
const pricing: AiDiplomacyPricing = { required: { truce12: 40, truce24: 60, alliance: null }, aiHoldings };
const reply: DiplomacyStanceReply = { found: true, targetPlayerName: "Milo", targetPlayerId: "ai-1", ai: true, pricing };
const own: DiplomacyGoods = { gold: 100, resources: { FOOD: 20, CRYSTAL: 5 } };
// Asking for 5 Titanium supply slots (4 coin/day each) is worth 20 coin to the AI.
const askTitanium = (giveFood = 0): TradeSelection => ({
  kind: "trade",
  durationHours: 12,
  terms: { give: { gold: 0, ...(giveFood ? { resources: { FOOD: giveFood } } : {}) }, ask: { gold: 0, resources: { TITANIUM: 5 } } }
});

describe("balancingAmount", () => {
  it("adds exactly the Food that makes the AI accept a resource trade", () => {
    expect(balancingAmount(reply, askTitanium(), own, "give-FOOD")).toBe(5);
    expect(balancingAmount(reply, askTitanium(2), own, "give-FOOD")).toBe(5);
    expect(balancingAmount(reply, askTitanium(), own, "give-gold")).toBe(20);
    // Crystal is worth 6 a slot: 4 slots cover the 20 owed.
    expect(balancingAmount(reply, askTitanium(), own, "give-CRYSTAL")).toBe(4);
    const terms = { give: { gold: 0, resources: { FOOD: 5 } }, ask: { gold: 0, resources: { TITANIUM: 5 } } };
    expect(evaluateResourceTradeOffer(terms, aiHoldings).accepts).toBe(true);
  });

  // Opening Coin to look at it put the player's whole treasury into a truce they couldn't afford.
  it("leaves an accepted deal alone and never fills a price one good can't cover", () => {
    expect(balancingAmount(reply, askTitanium(5), own, "give-FOOD")).toBeUndefined();
    expect(balancingAmount(reply, askTitanium(), { gold: 0, resources: { FOOD: 3 } }, "give-FOOD")).toBeUndefined();
    const truce: TradeSelection = { kind: "truce", durationHours: 12, terms: { give: { gold: 0 }, ask: { gold: 0 } } };
    expect(balancingAmount(reply, truce, { gold: 25 }, "give-gold")).toBeUndefined();
    expect(balancingAmount({ found: true, targetPlayerName: "Valka", targetPlayerId: "p2", ai: false }, askTitanium(), own, "give-FOOD")).toBeUndefined();
  });

  it("asks the AI for the surplus when the deal already overpays it", () => {
    // 10 Food (40) for 5 Titanium (20): 20 coin of surplus.
    expect(balancingAmount(reply, askTitanium(10), own, "ask-gold")).toBe(20);
    expect(balancingAmount(reply, askTitanium(10), own, "ask-TITANIUM")).toBe(10);
    expect(balancingAmount(reply, askTitanium(), own, "ask-gold")).toBeUndefined();
  });

  it("tops a truce up to the AI's price and never asks anything for an alliance", () => {
    const truce: TradeSelection = { kind: "truce", durationHours: 12, terms: { give: { gold: 10 }, ask: { gold: 0 } } };
    expect(balancingAmount(reply, truce, own, "give-gold")).toBe(40);
    const friendly = { ...reply, pricing: { ...pricing, required: { ...pricing.required, alliance: 0 } } };
    const alliance: TradeSelection = { kind: "alliance", durationHours: 12, terms: { give: { gold: 30 }, ask: { gold: 0 } } };
    expect(balancingAmount(friendly, alliance, own, "ask-gold")).toBeUndefined();
  });
});

describe("suggestedTradeDeal for resource trades", () => {
  it("tops up the good already offered, then coin", () => {
    expect(suggestedTradeDeal(reply, askTitanium(1), own)).toEqual({ give: { gold: 0, resources: { FOOD: 5 } }, ask: { gold: 0, resources: { TITANIUM: 5 } } });
    expect(suggestedTradeDeal(reply, askTitanium(), { gold: 100 })).toEqual({ give: { gold: 20 }, ask: { gold: 0, resources: { TITANIUM: 5 } } });
  });

  it("asks for the surplus instead of letting the player overpay", () => {
    expect(suggestedTradeDeal(reply, askTitanium(10), own)).toEqual({ give: { gold: 0, resources: { FOOD: 10 } }, ask: { gold: 20, resources: { TITANIUM: 5 } } });
  });

  it("combines goods when one alone can't cover the price", () => {
    // 3 Food (12) then 8 coin for the 20 owed.
    expect(suggestedTradeDeal(reply, askTitanium(1), { gold: 100, resources: { FOOD: 3 } }))
      .toEqual({ give: { gold: 8, resources: { FOOD: 3 } }, ask: { gold: 0, resources: { TITANIUM: 5 } } });
  });

  it("has no suggestion the player can't afford", () => {
    expect(suggestedTradeDeal(reply, askTitanium(), { gold: 3 })).toBeUndefined();
  });
});

// Players had to nudge Food up by 1 until the AI said yes, and Suggest deal was hidden for resource trades.
describe("trade screen", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  const openAskingTitanium = () => {
    const send = vi.fn((_payload: unknown, _message: string) => true);
    openDiplomacyTradeScreen({ targetName: "Milo", targetPlayerId: "ai-1", kind: "trade", durationHours: 12, terms: askTitanium().terms }, { send, ownHoldings: () => own });
    receiveDiplomacyStance(reply);
    return { send, overlay: document.querySelector<HTMLElement>(".diplomacy-trade-overlay")! };
  };

  it("pressing Food adds just enough for the AI to accept", () => {
    const { overlay } = openAskingTitanium();
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Milo would decline: wants about 20 more coin's worth. Press a good on your side to add just enough.");
    overlay.querySelector<HTMLButtonElement>('[data-trade-good="give-FOOD"]')!.click();
    expect(overlay.querySelector('[data-trade-amount="give-FOOD"]')?.textContent).toBe("5");
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Milo would accept this resource trade.");
    // Closing and reopening the row doesn't add more once the deal is accepted.
    overlay.querySelector<HTMLButtonElement>('[data-trade-good="give-FOOD"]')!.click();
    overlay.querySelector<HTMLButtonElement>('[data-trade-good="give-FOOD"]')!.click();
    expect(overlay.querySelector('[data-trade-amount="give-FOOD"]')?.textContent).toBe("5");
  });

  it("shows Suggest deal for a resource trade and fills the terms", () => {
    const { overlay, send } = openAskingTitanium();
    const suggest = overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]")!;
    expect(suggest.hidden).toBe(false);
    expect(suggest.disabled).toBe(false);
    suggest.click();
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Milo would accept this resource trade.");
    overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    expect(send.mock.calls.at(-1)![0]).toMatchObject({ type: "RESOURCE_TRADE_REQUEST", terms: { give: { gold: 20 }, ask: { resources: { TITANIUM: 5 } } } });
  });
});
