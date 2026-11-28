// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AllianceRequest, TruceRequest } from "../client-types.js";
import { closeDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { counterOfferScreenInput, openCounterOfferScreen } from "./client-alliance-counter-offer.js";

const names: Record<string, string> = { "ai-10": "Tove" };
const playerNameForOwner = (id?: string | null): string | undefined => (id ? names[id] : undefined);
const truce: TruceRequest = {
  id: "truce-1",
  fromPlayerId: "ai-10",
  toPlayerId: "me",
  createdAt: 1_000,
  expiresAt: 2_000,
  durationHours: 12,
  terms: { give: { gold: 10 }, ask: { gold: 0 } }
};
const alliance: AllianceRequest = { id: "alliance-1", fromPlayerId: "ai-10", toPlayerId: "me", createdAt: 1_000 };
// Fresh per test: sending a counter drops the offer it answers from the state.
let state = { gold: 500, incomingTruceRequests: [truce], incomingAllianceRequests: [alliance], activeTruces: [] };

const openCounter = (kind: "truce" | "alliance", requestId: string) => {
  const sendGameMessage = vi.fn(() => true);
  openCounterOfferScreen(kind, requestId, { playerNameForOwner, sendGameMessage, state });
  return { sendGameMessage };
};
const overlay = (): HTMLElement => document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
const field = (attr: string): HTMLInputElement => overlay().querySelector<HTMLInputElement>(`[${attr}]`)!;

describe("counter-offers", () => {
  beforeEach(() => {
    state = { gold: 500, incomingTruceRequests: [truce], incomingAllianceRequests: [alliance], activeTruces: [] };
  });
  afterEach(() => closeDiplomacyTradeScreen());

  it("opens the trade screen with the offer's terms seen from the player's side", () => {
    openCounter("truce", "truce-1");

    expect(overlay().querySelector("h2")?.textContent).toBe("Counter Tove's offer");
    expect(overlay().querySelector("[data-trade-kind][aria-pressed='true']")?.getAttribute("data-trade-kind")).toBe("truce:12");
    // Tove gives 10 coin -> you ask 10 coin.
    expect(field("data-trade-give-gold").value).toBe("0");
    expect(field("data-trade-ask-gold").value).toBe("10");
  });

  // "I'll take the truce if you pay 24 coin."
  it("sends the edited terms as a counter that replaces their offer", () => {
    const { sendGameMessage } = openCounter("alliance", "alliance-1");
    overlay().querySelector<HTMLButtonElement>("[data-trade-kind='truce:24']")!.click();
    field("data-trade-ask-gold").value = "24";
    field("data-trade-ask-gold").dispatchEvent(new Event("input"));
    overlay().querySelector<HTMLButtonElement>("[data-trade-send]")!.click();

    expect(sendGameMessage).toHaveBeenLastCalledWith(
      {
        type: "TRUCE_REQUEST",
        targetPlayerName: "Tove",
        targetPlayerId: "ai-10",
        durationHours: 24,
        terms: { give: { gold: 0 }, ask: { gold: 24 } },
        counters: { kind: "alliance", requestId: "alliance-1" }
      },
      expect.any(String)
    );
    // The countered offer leaves the dock and Diplomacy at once (playtest 2026-11-27).
    expect(state.incomingAllianceRequests).toEqual([]);
  });

  it("does nothing for an offer that has already gone", () => {
    expect(counterOfferScreenInput("truce", "missing", { playerNameForOwner, state })).toBeUndefined();
    expect(counterOfferScreenInput("alliance", "alliance-1", { playerNameForOwner, state })).toEqual({
      targetName: "Tove",
      targetPlayerId: "ai-10",
      kind: "alliance",
      durationHours: 12,
      counters: { kind: "alliance", requestId: "alliance-1" }
    });
  });
});
