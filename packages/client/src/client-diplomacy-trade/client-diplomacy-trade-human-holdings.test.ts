import { describe, expect, it } from "vitest";
import { haveText } from "./client-diplomacy-trade-have-text.js";
import { TRADE_GOODS, theirHoldings, tradeGoodsLimits } from "./client-diplomacy-trade-goods.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

// Playtest 2026-11-17: the deal screen showed a human's goods with no amounts.
const human: DiplomacyStanceReply = {
  found: true, targetPlayerName: "Konrad", targetPlayerId: "p2", ai: false,
  holdings: { gold: 120, resources: { FOOD: 3 } }
};
const own = { gold: 48, resources: { FOOD: 15 } };
const askGold = TRADE_GOODS.find(spec => spec.key === "ask-gold")!;
const askFood = TRADE_GOODS.find(spec => spec.key === "ask-FOOD")!;
const reach = { give: { gold: 0 }, ask: { gold: 0 } };

describe("deal screen: a human's holdings", () => {
  it("shows what an online human has", () => {
    const theirs = theirHoldings(human);
    expect(haveText(own, theirs, askGold)).toBe("Has 120");
    expect(haveText(own, theirs, askFood)).toBe("3 spare");
  });
  it("caps what you can ask for at what they hold", () => {
    const limits = tradeGoodsLimits(own, human, reach);
    expect(limits["ask-gold"]).toBe(120);
    expect(limits["ask-FOOD"]).toBe(3);
  });
  it("shows nothing for a human whose holdings are unknown", () => {
    const offline: DiplomacyStanceReply = { found: true, targetPlayerName: "Konrad", targetPlayerId: "p2", ai: false };
    expect(theirHoldings(offline)).toBeUndefined();
    expect(haveText(own, undefined, askGold)).toBe("");
  });
});
