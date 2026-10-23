// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AllianceRequest, TruceRequest } from "../client-types.js";
import { closeDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { allianceRequestsHtml, truceRequestsHtml } from "../client-panel-html/client-panel-html.js";
import { bindCounterOfferButtons, counterOfferScreenInput } from "./client-alliance-counter-offer.js";

const names: Record<string, string> = { "ai-10": "Tove" };
const playerNameForOwner = (id?: string | null): string | undefined => (id ? names[id] : undefined);
const truce: TruceRequest = {
  id: "truce-1",
  fromPlayerId: "ai-10",
  toPlayerId: "me",
  createdAt: 1_000,
  expiresAt: 2_000,
  durationHours: 12,
  terms: { give: { gold: 10, shard: 0 }, ask: { gold: 0, shard: 1 } }
};
const alliance: AllianceRequest = { id: "alliance-1", fromPlayerId: "ai-10", toPlayerId: "me", createdAt: 1_000 };
const state = { gold: 500, strategicResources: { SHARD: 3 }, incomingTruceRequests: [truce], incomingAllianceRequests: [alliance] };

const mountCards = () => {
  const root = document.createElement("div");
  root.innerHTML = `${truceRequestsHtml([truce], playerNameForOwner, "incoming", 1_500)}${allianceRequestsHtml([alliance], playerNameForOwner, "incoming", 1_500)}`;
  const sendGameMessage = vi.fn(() => true);
  bindCounterOfferButtons(root, { playerNameForOwner, sendGameMessage, state });
  return { root, sendGameMessage };
};
const overlay = (): HTMLElement => document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
const field = (attr: string): HTMLInputElement => overlay().querySelector<HTMLInputElement>(`[${attr}]`)!;

describe("counter-offers", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  it("puts a Counter button on incoming offers only", () => {
    expect(truceRequestsHtml([truce], playerNameForOwner, "incoming")).toContain('data-counter-request-id="truce-1"');
    expect(truceRequestsHtml([truce], playerNameForOwner, "outgoing")).not.toContain("counter-offer");
    expect(allianceRequestsHtml([alliance], playerNameForOwner, "outgoing")).not.toContain("counter-offer");
  });

  it("opens the trade screen with the offer's terms seen from the player's side", () => {
    const { root } = mountCards();
    root.querySelector<HTMLButtonElement>('[data-counter-request-id="truce-1"]')!.click();

    expect(overlay().querySelector("h2")?.textContent).toBe("Counter Tove's offer");
    expect(overlay().querySelector("[data-trade-kind][aria-pressed='true']")?.getAttribute("data-trade-kind")).toBe("truce:12");
    // Tove gives 10 coin and asks 1 Shard -> you ask 10 coin and give 1 Shard.
    expect([field("data-trade-give-gold").value, field("data-trade-give-shard").value]).toEqual(["0", "1"]);
    expect([field("data-trade-ask-gold").value, field("data-trade-ask-shard").value]).toEqual(["10", "0"]);
  });

  // "I'll take the truce if you pay 24 coin."
  it("sends the edited terms as a counter that replaces their offer", () => {
    const { root, sendGameMessage } = mountCards();
    root.querySelector<HTMLButtonElement>('[data-counter-request-id="alliance-1"]')!.click();
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
        terms: { give: { gold: 0, shard: 0 }, ask: { gold: 24, shard: 0 } },
        counters: { kind: "alliance", requestId: "alliance-1" }
      },
      expect.any(String)
    );
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
