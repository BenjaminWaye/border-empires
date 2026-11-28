// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { applyResourceTradeMessage } from "./client-player-resource-state.js";
import { createInitialResourceTradeState } from "./client-resource-trade-state.js";

const accepted = { type: "RESOURCE_TRADE_ACCEPTED", offerId: "o1", fromPlayerId: "me", toPlayerId: "ai-3", fromPlayerName: "Iron Marches", toPlayerName: "Tove" };
const toastText = (): string | null | undefined => document.getElementById("action-toast")?.textContent;

afterEach(() => document.getElementById("action-toast")?.remove());

// Regression (first-15 playtest r1, pt-diplomat): "There was no 'Tove accepted!' moment… my coin dropped."
describe("RESOURCE_TRADE_ACCEPTED", () => {
  it("tells the proposer the other House accepted", () => {
    const state = { ...createInitialResourceTradeState(), me: "me" };
    expect(applyResourceTradeMessage(state, accepted)).toBe(true);
    expect(toastText()).toBe("Tove accepted your trade");
  });

  it("tells the House that accepted the trade is agreed", () => {
    const state = { ...createInitialResourceTradeState(), me: "ai-3" };
    applyResourceTradeMessage(state, accepted);
    expect(toastText()).toBe("Trade with Iron Marches agreed");
  });

  it("shows nothing for a plain offers update", () => {
    const state = { ...createInitialResourceTradeState(), me: "me" };
    applyResourceTradeMessage(state, { type: "RESOURCE_TRADE_UPDATE", offers: [] });
    expect(toastText()).toBeUndefined();
  });
});
