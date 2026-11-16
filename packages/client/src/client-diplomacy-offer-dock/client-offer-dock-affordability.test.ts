// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiplomacyGoods } from "@border-empires/shared";

import { installDiplomacyOfferDock, offerDockEntries } from "./client-diplomacy-offer-dock.js";

// Playtest 2026-11-16 (Lena, day 3): the dock let her accept an AI counter-offer
// she couldn't pay; the server then refused it with a wrong, raw reason. And the
// dock had no way to counter the offer instead.
const truce = (id: string, ask: DiplomacyGoods) => ({
  id,
  fromPlayerId: `from-${id}`,
  toPlayerId: "me",
  createdAt: 0,
  expiresAt: 300_000,
  durationHours: 12 as const,
  fromName: "Gerald",
  terms: { give: { gold: 0 }, ask }
});

type DockState = Parameters<typeof offerDockEntries>[0];

const entriesFor = (state: DockState) => offerDockEntries(state, new Map(), new Set(), 0, () => undefined);

describe("offer dock affordability", () => {
  const base = { me: "me", incomingAllianceRequests: [] };

  it("blocks an accept that asks for more coin than you have, with the deal screen's reason", () => {
    const [entry] = entriesFor({ ...base, gold: 12.7, incomingTruceRequests: [truce("t1", { gold: 40 })] });
    expect(entry?.blockedReason).toBe("You only have 12 coin.");
  });

  it("blocks an accept that asks for supply slots you don't have spare", () => {
    const [entry] = entriesFor({ ...base, gold: 100, resourceTradeHoldings: { FOOD: 1 }, incomingTruceRequests: [truce("t1", { gold: 0, resources: { FOOD: 2 } })] });
    expect(entry?.blockedReason).toBe("You only have 1 spare FOOD slots.");
  });

  it("does not block what it can't check yet, or an offer you can pay", () => {
    const unknown = entriesFor({ ...base, incomingTruceRequests: [truce("t1", { gold: 40 })] });
    expect(unknown[0]?.blockedReason).toBeUndefined();
    const unsynced = entriesFor({ ...base, gold: 50, incomingTruceRequests: [truce("t1", { gold: 40, resources: { FOOD: 2 } })] });
    expect(unsynced[0]?.blockedReason).toBeUndefined();
    const affordable = entriesFor({ ...base, gold: 50, resourceTradeHoldings: { FOOD: 2 }, incomingTruceRequests: [truce("t1", { gold: 40, resources: { FOOD: 2 } })] });
    expect(affordable[0]?.blockedReason).toBeUndefined();
  });
});

describe("installed offer dock: unaffordable offers and Counter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  const mount = (gold: number, openCounter?: (kind: "truce" | "alliance", requestId: string) => void) => {
    const state = { me: "me", gold, incomingTruceRequests: [truce("t1", { gold: 40 })], incomingAllianceRequests: [] };
    const sendGameMessage = vi.fn(() => true);
    installDiplomacyOfferDock({ state, sendGameMessage, ...(openCounter ? { openCounter } : {}) });
    const dock = document.getElementById("diplomacy-offer-dock")!;
    const button = (action: string): HTMLButtonElement | null => dock.querySelector<HTMLButtonElement>(`[data-offer-action="${action}"][data-offer-id="t1"]`);
    return { state, sendGameMessage, dock, button };
  };

  it("disables Accept and says why when you can't pay, and never sends the accept", () => {
    const { sendGameMessage, dock, button } = mount(10, vi.fn());
    expect(button("accept")?.disabled).toBe(true);
    expect(button("accept")?.title).toBe("You only have 10 coin.");
    expect(dock.querySelector("[data-offer-blocked]")?.textContent).toBe("Can't accept: You only have 10 coin. Counter or decline instead.");
    button("accept")?.click();
    button("accept")?.click();
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("re-enables Accept once you can pay", () => {
    const { state, button } = mount(10);
    state.gold = 60;
    vi.advanceTimersByTime(1_000);
    expect(button("accept")?.disabled).toBe(false);
  });

  it("opens the counter-offer screen for that offer from Counter", () => {
    const openCounter = vi.fn();
    const { sendGameMessage, button } = mount(10, openCounter);
    button("counter")?.click();
    expect(openCounter).toHaveBeenCalledWith("truce", "t1");
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("shows no Counter button without a way to open the deal screen", () => {
    expect(mount(100).button("counter")).toBeNull();
  });
});
