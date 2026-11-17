// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientMessageSchema, type ResourceTradeOffer } from "@border-empires/shared";
import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "./client-diplomacy-trade.js";

const offer = (overrides: Partial<ResourceTradeOffer> = {}): ResourceTradeOffer => ({
  id: "offer-1", fromPlayerId: "maren", toPlayerId: "self", fromPlayerName: "Maren", toPlayerName: "You",
  terms: { give: { gold: 0, resources: { FOOD: 3 } }, ask: { gold: 12 }, supplyDurationHours: 24 },
  createdAt: 1, expiresAt: Date.now() + 3_600_000, status: "pending", ...overrides
});

const openWith = (offers: ResourceTradeOffer[]) => {
  const send = vi.fn((_payload: unknown, _message: string) => true);
  openDiplomacyTradeScreen({ targetName: "Maren", targetPlayerId: "maren", kind: "trade", durationHours: 12 }, {
    send, ownHoldings: () => ({ gold: 50, resources: {} }), activeSupply: () => ({ ownId: "self", agreements: [], offers })
  });
  receiveDiplomacyStance({ found: true, targetPlayerName: "Maren", targetPlayerId: "maren", ai: false });
  return send;
};

afterEach(() => closeDiplomacyTradeScreen());

describe("countering a resource trade offer", () => {
  // Playtest 2026-11-17: an incoming resource offer had only Accept and Decline.
  it("fills the deal from the player's side and sends the counter in the offer's place", () => {
    const send = openWith([offer()]);
    document.querySelector<HTMLButtonElement>('[data-resource-offer-counter="offer-1"]')!.click();
    expect(document.querySelector("#diplomacy-trade-title")?.textContent).toBe("Counter Maren's offer");
    const field = document.querySelector<HTMLInputElement>('[data-trade-exact="give-gold"]')!;
    expect(field.value).toBe("12");
    field.value = "8";
    field.dispatchEvent(new Event("input"));
    document.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    const payload = send.mock.calls.at(-1)![0];
    expect(payload).toMatchObject({
      type: "RESOURCE_TRADE_REQUEST", targetPlayerId: "maren", countersOfferId: "offer-1",
      terms: { give: { gold: 8 }, ask: { resources: { FOOD: 3 } }, supplyDurationHours: 24 }
    });
    expect(ClientMessageSchema.safeParse(payload).success).toBe(true);
  });

  it("offers Counter only on pending offers the player received", () => {
    openWith([offer(), offer({ id: "sent", fromPlayerId: "self", toPlayerId: "maren" }), offer({ id: "paying", status: "settling" })]);
    expect(document.querySelector('[data-resource-offer-counter="offer-1"]')).not.toBeNull();
    expect(document.querySelector('[data-resource-offer-counter="sent"]')).toBeNull();
    expect(document.querySelector('[data-resource-offer-counter="paying"]')).toBeNull();
  });
});
