// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "./client-diplomacy-trade.js";
import { dealKind } from "./client-diplomacy-trade-deal.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

const empty = { gold: 0, shard: 0 };

const openScreen = (holdings = { gold: 100, shard: 3, resources: { FOOD: 2 } }, kind: "truce" | "trade" = "truce") => {
  const send = vi.fn().mockReturnValue(true);
  openDiplomacyTradeScreen({ targetName: "Milo", targetPlayerId: "p-2", kind, durationHours: 12 }, { send, ownHoldings: () => holdings });
  const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
  const typeAmount = (key: string, value: string): void => {
    const field = overlay.querySelector<HTMLInputElement>(`[data-trade-exact="${key}"]`)!;
    field.value = value;
    field.dispatchEvent(new Event("input"));
  };
  return { send, overlay, typeAmount };
};

describe("dealKind", () => {
  it("follows the treaty, else resource supply or asks make a trade and plain giving is a gift", () => {
    const terms = { give: { gold: 5, shard: 0 }, ask: empty };
    expect(dealKind("alliance", terms)).toBe("alliance");
    expect(dealKind(undefined, terms)).toBe("gift");
    expect(dealKind(undefined, { give: { ...empty, resources: { FOOD: 1 } }, ask: empty })).toBe("trade");
    expect(dealKind(undefined, { give: empty, ask: { gold: 5, shard: 0 } })).toBe("trade");
  });
});

describe("diplomacy deal table", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  it("puts your goods and the treaties on the left, theirs on the right, and only the deal in the middle", () => {
    const { overlay } = openScreen();
    const yours = overlay.querySelector<HTMLElement>("[data-trade-side='give']")!;
    const theirs = overlay.querySelector<HTMLElement>("[data-trade-side='ask']")!;
    expect(yours.querySelector("[data-trade-kind='truce:12']")).not.toBeNull();
    expect(yours.querySelector("[data-trade-kind='alliance:0']")).not.toBeNull();
    expect(yours.querySelector("[data-trade-good='give-gold']")).not.toBeNull();
    expect(theirs.querySelector("[data-trade-good='ask-gold']")).not.toBeNull();
    // You only list resources you have spare; their spare slots are unknown, so all are listed.
    expect(overlay.querySelector<HTMLElement>("[data-trade-row='give-FOOD']")!.hidden).toBe(false);
    expect(overlay.querySelector<HTMLElement>("[data-trade-row='give-CRYSTAL']")!.hidden).toBe(true);
    expect(overlay.querySelector<HTMLElement>("[data-trade-row='ask-CRYSTAL']")!.hidden).toBe(false);
    expect(overlay.querySelector("[data-trade-have='give-FOOD']")?.textContent).toBe("2 spare");

    const deal = overlay.querySelector<HTMLElement>("[data-trade-deal]")!;
    expect(deal.querySelector("[data-deal-treaty='truce']")?.textContent).toContain("Truce · 12h");
    expect(deal.querySelector("[data-deal-item]")).toBeNull();
  });

  it("adds goods to the deal from a slider, and ✕ takes them out again", () => {
    const { overlay, typeAmount } = openScreen();
    overlay.querySelector<HTMLButtonElement>("[data-trade-good='give-gold']")!.click();
    expect(overlay.querySelector<HTMLElement>("[data-trade-slider='give-gold']")!.hidden).toBe(false);
    const slider = overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!;
    slider.value = "30";
    slider.dispatchEvent(new Event("input"));
    typeAmount("ask-CRYSTAL", "4");
    const deal = overlay.querySelector<HTMLElement>("[data-trade-deal]")!;
    expect(deal.querySelector("[data-deal-side='give']")?.textContent).toContain("30 Coin");
    expect(deal.querySelector("[data-deal-side='ask']")?.textContent).toContain("4 Crystal");
    expect(deal.querySelector("[data-deal-side='ask'] h4")?.textContent).toBe("Milo gives");

    deal.querySelector<HTMLButtonElement>("[data-deal-remove='give-gold']")!.click();
    expect(deal.querySelector("[data-deal-item='give-gold']")).toBeNull();
    expect(overlay.querySelector("[data-trade-amount='give-gold']")?.textContent).toBe("0");
    // Pressing an item in the deal opens its slider for a new amount.
    deal.querySelector<HTMLButtonElement>("[data-deal-edit='ask-CRYSTAL']")!.click();
    expect(overlay.querySelector<HTMLElement>("[data-trade-slider='ask-CRYSTAL']")!.hidden).toBe(false);
  });

  it("toggles treaties: picking one replaces the other, pressing it again takes it out", () => {
    const { overlay, send, typeAmount } = openScreen();
    overlay.querySelector<HTMLButtonElement>("[data-trade-kind='alliance:0']")!.click();
    expect(overlay.querySelector("[data-deal-treaty]")?.textContent).toContain("Alliance");
    expect(overlay.querySelector("[data-trade-kind='truce:12']")?.getAttribute("aria-pressed")).toBe("false");
    overlay.querySelector<HTMLButtonElement>("[data-trade-kind='alliance:0']")!.click();
    expect(overlay.querySelector("[data-deal-treaty]")).toBeNull();
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Pick a truce or alliance on the left, or add goods from either side.");
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.disabled).toBe(true);

    // Asking for coin alone, with no treaty or supply, is not a deal the server takes.
    typeAmount("ask-gold", "10");
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.disabled).toBe(true);
    // A resource supply makes it a resource trade.
    typeAmount("give-FOOD", "1");
    overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    expect(send).toHaveBeenLastCalledWith(
      { type: "RESOURCE_TRADE_REQUEST", targetPlayerName: "Milo", targetPlayerId: "p-2", terms: { give: { gold: 0, shard: 0, resources: { FOOD: 1 } }, ask: { gold: 10, shard: 0 } } },
      expect.any(String)
    );
  });

  it("lists only the resources an AI has spare once its holdings are known", () => {
    const { overlay } = openScreen();
    const ai: DiplomacyStanceReply = {
      found: true,
      targetPlayerName: "Milo",
      targetPlayerId: "p-2",
      ai: true,
      pricing: { required: { truce12: 0, truce24: 0, alliance: 0 }, shardCoinValue: 25, aiHoldings: { gold: 40, shard: 0, resources: { TITANIUM: 3 } } }
    };
    receiveDiplomacyStance(ai);
    expect(overlay.querySelector<HTMLElement>("[data-trade-row='ask-TITANIUM']")!.hidden).toBe(false);
    expect(overlay.querySelector<HTMLElement>("[data-trade-row='ask-CRYSTAL']")!.hidden).toBe(true);
    expect(overlay.querySelector("[data-trade-have='ask-gold']")?.textContent).toBe("Has 40");
    expect(overlay.querySelector<HTMLInputElement>("[data-trade-ask-TITANIUM]")!.max).toBe("3");
  });
});
