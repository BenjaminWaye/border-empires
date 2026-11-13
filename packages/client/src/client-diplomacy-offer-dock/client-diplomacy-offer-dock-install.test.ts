// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installDiplomacyOfferDock, OFFER_DOCK_CONFIRM_MS, OFFER_DOCK_PENDING_MS } from "./client-diplomacy-offer-dock.js";

const truce = (id: string, ask = { gold: 0 }) => ({
  id,
  fromPlayerId: `from-${id}`,
  toPlayerId: "me",
  createdAt: 0,
  expiresAt: 300_000,
  durationHours: 12 as const,
  fromName: "Tove",
  terms: { give: { gold: 0 }, ask }
});

const mount = (truces: ReturnType<typeof truce>[]) => {
  const state = { me: "me", incomingTruceRequests: truces, incomingAllianceRequests: [] };
  const sendGameMessage = vi.fn(() => true);
  installDiplomacyOfferDock({ state, sendGameMessage });
  const dock = document.getElementById("diplomacy-offer-dock")!;
  const button = (action: string, id: string): HTMLButtonElement => dock.querySelector<HTMLButtonElement>(`[data-offer-action="${action}"][data-offer-id="${id}"]`)!;
  return { state, sendGameMessage, dock, button };
};

describe("installed offer dock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("accepts a free offer in one tap, then holds the buttons until the server answers", () => {
    const { sendGameMessage, button } = mount([truce("t1")]);
    button("accept", "t1").click();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_ACCEPT", requestId: "t1", confirmedResourceSupply: true }, expect.any(String));
    expect(button("accept", "t1").disabled).toBe(true);
    // The server refused without dropping the offer: the buttons come back.
    vi.advanceTimersByTime(OFFER_DOCK_PENDING_MS + 1_000);
    expect(button("accept", "t1").disabled).toBe(false);
  });

  it("asks for a second tap before spending your coin, and disarms if you don't", () => {
    const { sendGameMessage, button } = mount([truce("t1", { gold: 60 })]);
    button("accept", "t1").click();
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(button("accept", "t1").textContent).toBe("Confirm");
    expect(button("accept", "t1").title).toContain("you pay 60 coin");

    vi.advanceTimersByTime(OFFER_DOCK_CONFIRM_MS + 1_000);
    expect(button("accept", "t1").textContent).toBe("Accept");

    button("accept", "t1").click();
    button("accept", "t1").click();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_ACCEPT", requestId: "t1", confirmedResourceSupply: true }, expect.any(String));
  });

  // Playtest 2026-11-12: on an AI counter-offer the Confirm tap sent the accept, but the
  // disabled button went straight back to "Accept", so it read as a tap that did nothing.
  it("labels a sent accept as Sending until the server answers, instead of reverting to Accept", () => {
    const { sendGameMessage, button } = mount([truce("t1", { gold: 16 })]);
    button("accept", "t1").click();
    vi.advanceTimersByTime(5_000); // a phone player reads the terms before confirming
    expect(button("accept", "t1").textContent).toBe("Confirm");
    button("accept", "t1").click();
    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    expect(button("accept", "t1").textContent).toBe("Sending…");
    expect(button("accept", "t1").disabled).toBe(true);
  });

  it("confirms the resource supply it shows, so the gateway does not refuse a supply offer", () => {
    const { sendGameMessage, button } = mount([truce("t1", { gold: 0, resources: { FOOD: 2 } } as { gold: number })]);
    button("accept", "t1").click();
    button("accept", "t1").click();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_ACCEPT", requestId: "t1", confirmedResourceSupply: true }, expect.any(String));
  });

  it("hides an offer to answer later in Alliances, without answering it", () => {
    const { sendGameMessage, dock, button } = mount([truce("t1")]);
    button("hide", "t1").click();
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(dock.style.display).toBe("none");
  });

  it("updates only the countdown between offer changes, so a focused button survives", () => {
    const { button } = mount([truce("t1")]);
    const accept = button("accept", "t1");
    vi.advanceTimersByTime(2_000);
    expect(button("accept", "t1")).toBe(accept);
  });

  it("stays hidden while the map-loading overlay is up, then shows the offer", () => {
    let loading = true;
    const state = { me: "me", incomingTruceRequests: [truce("t1")], incomingAllianceRequests: [] };
    installDiplomacyOfferDock({ state, sendGameMessage: vi.fn(() => true), isMapLoading: () => loading });
    const dock = document.getElementById("diplomacy-offer-dock")!;
    expect(dock.style.display).toBe("none");
    loading = false;
    vi.advanceTimersByTime(1_000);
    expect(dock.style.display).toBe("grid");
  });
});
