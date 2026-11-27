// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { giftView, type AiDiplomacyPricing, type ReturnableTown } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "./client-diplomacy-trade.js";
import { giftVerdict } from "./client-diplomacy-gift-view.js";
import { withTownToggled } from "./client-diplomacy-town-return.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

// "Return a town" on the trade screen: the towns the stance reply lists can be
// put into a truce (or a gift to an AI), and the AI's price counts them.
const oak: ReturnableTown = { x: 4, y: 4, toPlayerId: "ai-1", name: "Oakridge", tier: "CITY", capturedAt: 1 };
// Refuses a truce while it can retake its land, unless Oakridge comes back.
const pricing: AiDiplomacyPricing = {
  required: { truce12: null, truce24: null, alliance: null },
  aiHoldings: { gold: 0 },
  townValues: [{ x: 4, y: 4, value: 500 }],
  townReturn: { truce12: 300, truce24: 450 }
};
const reply: DiplomacyStanceReply = {
  found: true, targetPlayerName: "Milo", targetPlayerId: "ai-1", ai: true,
  truceRefusal: "Milo wants to see how this war goes first: it means to win its land back. It would make peace if you returned the town you took from it.",
  pricing, returnableTowns: [oak]
};

const open = (send = vi.fn().mockReturnValue(true)) => {
  openDiplomacyTradeScreen({ targetName: "Milo", targetPlayerId: "ai-1", kind: "truce", durationHours: 12 }, { send, ownHoldings: () => ({ gold: 100 }) });
  receiveDiplomacyStance(reply);
  return send;
};
const townButton = () => document.querySelector<HTMLButtonElement>('[data-trade-town="4,4"]')!;
const verdictText = () => document.querySelector<HTMLElement>("[data-trade-verdict]")?.textContent ?? "";

describe("trade screen: return a town", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  it("lists the towns you could return, and hides the section when there are none", () => {
    open();
    expect(document.querySelector<HTMLElement>("[data-trade-towns]")?.hidden).toBe(false);
    expect(townButton().textContent).toContain("Oakridge");
    receiveDiplomacyStance({ ...reply, returnableTowns: [] });
    expect(document.querySelector<HTMLElement>("[data-trade-towns]")?.hidden).toBe(true);
  });

  it("lays a town row out like a resource row: icon, then name and details, then the tick", () => {
    open();
    // Regression: the row's grid is icon | name | amount. Without the icon
    // cell the name was squeezed into the 28px icon column ("Lu…") and the
    // tier and coordinates wrapped one word per line.
    const [icon, name, amount] = Array.from(townButton().children);
    expect(townButton().children).toHaveLength(3);
    expect(icon?.classList.contains("diplomacy-trade-good-icon")).toBe(true);
    expect(icon?.querySelector("img")?.getAttribute("src")).toBe("/icons/nav/towns.svg");
    expect(name?.classList.contains("diplomacy-trade-good-name")).toBe(true);
    expect(amount?.classList.contains("diplomacy-trade-good-amount")).toBe(true);
    expect(townButton().querySelector(".diplomacy-trade-good-have")?.textContent).toBe("City · 4, 4");
  });

  it("turns a refused truce into an accepted one once the town is in the deal, and sends it", () => {
    const send = open();
    expect(verdictText()).toContain("means to win its land back");
    townButton().click();
    expect(townButton().getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-trade-deal]")?.textContent).toContain("Oakridge (4, 4)");
    expect(verdictText()).toBe("Milo would accept a 12h truce on these terms.");
    document.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "TRUCE_REQUEST", terms: { give: { gold: 0, towns: [{ x: 4, y: 4 }] }, ask: { gold: 0 } } }),
      expect.any(String)
    );
  });

  it("suggests handing the town back when only that buys the truce", () => {
    open();
    document.querySelector<HTMLButtonElement>("[data-trade-suggest]")!.click();
    expect(townButton().getAttribute("aria-pressed")).toBe("true");
    expect(verdictText()).toBe("Milo would accept a 12h truce on these terms.");
  });

  it("takes the town back out with its ✕ in the deal", () => {
    open();
    townButton().click();
    document.querySelector<HTMLButtonElement>('[data-deal-remove-town="4,4"]')!.click();
    expect(townButton().getAttribute("aria-pressed")).toBe("false");
  });

  // Regression: the town's value (500) is past the gift goodwill cap (250 coin
  // here), and the coin cap check refused every town gift.
  it("lets a town go as a gift even past the goodwill cap, but holds back coin beyond it", () => {
    const giftReply: DiplomacyStanceReply = { ...reply, attitude: { level: "CAUTIOUS", score: -10, modifiers: [] }, gift: giftView(0, 60) };
    const gifting = (gold: number) => giftVerdict({
      targetName: "Milo", reply: giftReply, own: { gold: 500 },
      selection: { kind: "gift", durationHours: 12, terms: { give: { gold, towns: [{ x: 4, y: 4 }] }, ask: { gold: 0 } } }
    });
    expect(gifting(0)).toMatchObject({ canSend: true, tone: "good" });
    expect(gifting(50)).toMatchObject({ canSend: false, text: expect.stringContaining("Give it without coin") });
  });

  // Regression: a town kept in the deal after switching to an alliance was sent and bounced as BAD_MSG.
  it("takes the town out when the deal switches to an alliance", () => {
    open();
    townButton().click();
    document.querySelector<HTMLButtonElement>('[data-trade-kind^="alliance"]')!.click();
    expect(document.querySelector("[data-trade-deal]")?.textContent).not.toContain("Oakridge");
    expect(townButton().disabled).toBe(true);
  });

  // Owner, 2026-11-27: you can ask an AI for a town back that it took from you.
  it("asks an AI for a town it took from you, in a truce only", () => {
    const pine: ReturnableTown = { x: 7, y: 8, toPlayerId: "p-me", name: "Pinewatch", tier: "TOWN", capturedAt: 1 };
    const send = vi.fn().mockReturnValue(true);
    openDiplomacyTradeScreen({ targetName: "Milo", targetPlayerId: "ai-1", kind: "truce", durationHours: 12 }, { send, ownHoldings: () => ({ gold: 500 }) });
    receiveDiplomacyStance({ ...reply, returnableTowns: [], askableTowns: [pine],
      pricing: { required: { truce12: 100, truce24: 200, alliance: null }, aiHoldings: { gold: 0 }, aiTownValues: [{ x: 7, y: 8, value: 200 }] } });
    expect(document.querySelector<HTMLElement>('[data-trade-towns="ask"]')?.hidden).toBe(false);
    const pineButton = () => document.querySelector<HTMLButtonElement>('[data-trade-town="7,8"][data-trade-town-side="ask"]')!;
    pineButton().click();
    expect(document.querySelector('[data-deal-side="ask"]')?.textContent).toContain("Pinewatch");
    // 100 for the truce plus 200 for the town.
    expect(verdictText()).toContain("wants about 300 more coin");
    document.querySelector<HTMLButtonElement>('[data-trade-kind^="alliance"]')!.click();
    expect(document.querySelector('[data-deal-side="ask"]')?.textContent ?? "").not.toContain("Pinewatch");
    expect(pineButton().disabled).toBe(true);
  });

  it("toggles a town in and out of what you give", () => {
    const withOak = withTownToggled({ give: { gold: 5 }, ask: { gold: 0 } }, oak);
    expect(withOak.give).toEqual({ gold: 5, towns: [{ x: 4, y: 4 }] });
    expect(withTownToggled(withOak, oak).give).toEqual({ gold: 5 });
  });
});
