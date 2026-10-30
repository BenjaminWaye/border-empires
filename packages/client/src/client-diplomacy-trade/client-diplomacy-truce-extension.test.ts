// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiDiplomacyPricing } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, receiveDiplomacyStance } from "./client-diplomacy-trade.js";
import { suggestedDeal, tradeVerdict, type DiplomacyStanceReply, type TradeSelection } from "./client-diplomacy-trade-view.js";

const HOUR = 3_600_000;
// A losing AI: it would pay 50 coin for a new truce.
const pricing: AiDiplomacyPricing = { required: { truce12: -50, truce24: -50, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 500, shard: 0 } };
const aiReply: DiplomacyStanceReply = { found: true, targetPlayerName: "Elin", targetPlayerId: "ai-2", ai: true, pricing };

const openInTruce = (hoursLeft: number, durationHours: 12 | 24 = 24, hoursSinceStart = 0) => {
  const send = vi.fn().mockReturnValue(true);
  const truce = { startedAt: Date.now() - hoursSinceStart * HOUR, endsAt: Date.now() + hoursLeft * HOUR };
  openDiplomacyTradeScreen(
    { targetName: "Elin", targetPlayerId: "ai-2", kind: "truce", durationHours },
    { send, ownHoldings: () => ({ gold: 100, shard: 0 }), runningTruce: (id) => (id === "ai-2" ? truce : undefined) }
  );
  return { send, overlay: document.querySelector<HTMLElement>(".diplomacy-trade-overlay")! };
};

afterEach(() => closeDiplomacyTradeScreen());

describe("extending a truce from the trade screen", () => {
  // Regression: with a truce running the screen offered Truce 12h/24h, which the gateway refused (TRUCE_EXISTS).
  it("offers Extend 12h / 24h with the time left, and sends the extension", () => {
    const { send, overlay } = openInTruce(22);
    expect(overlay.querySelector("[data-trade-current]")?.textContent).toBe("Truce · 22h left");
    expect(overlay.querySelector("[data-trade-kind='truce:12']")?.textContent).toBe("Extend 12h");
    // A truce begun now with 22h left + 24h = 46h in total, within the 48h cap.
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-kind='truce:24']")!.disabled).toBe(false);
    receiveDiplomacyStance(aiReply);
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Elin would accept a 24h truce extension on these terms.");
    const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!;
    expect(sendButton.textContent).toBe("Offer 24h extension");
    sendButton.click();
    expect(send).toHaveBeenLastCalledWith({ type: "TRUCE_REQUEST", targetPlayerName: "Elin", targetPlayerId: "ai-2", durationHours: 24 }, expect.any(String));
  });

  it("disables an extension past the 48h cap and falls back to one that fits", () => {
    const { overlay } = openInTruce(30);
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-kind='truce:24']")!.disabled).toBe(true);
    expect(overlay.querySelector("[data-trade-kind='truce:12']")?.getAttribute("aria-pressed")).toBe("true");
  });

  // Regression: the cap was 48h ahead of now, so a truce could be extended again every day for weeks.
  it("disables both extensions once the truce has run 48h since it began, however little is left", () => {
    const { overlay } = openInTruce(10, 24, 38);
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-kind='truce:12']")!.disabled).toBe(true);
    expect(overlay.querySelector<HTMLButtonElement>("[data-trade-kind='truce:24']")!.disabled).toBe(true);
  });

  it("keeps the plain truce buttons with no truce running", () => {
    const send = vi.fn().mockReturnValue(true);
    openDiplomacyTradeScreen({ targetName: "Elin", targetPlayerId: "ai-2", kind: "truce", durationHours: 12 }, { send, ownHoldings: () => ({ gold: 0, shard: 0 }), runningTruce: () => undefined });
    const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
    expect(overlay.querySelector("[data-trade-current]")).toBeNull();
    expect(overlay.querySelector("[data-trade-kind='truce:12']")?.textContent).toBe("Truce 12h");
  });
});

describe("extension pricing in the trade view", () => {
  const selection = (ask: number, extendsTruce: boolean): TradeSelection => ({
    kind: "truce",
    durationHours: 12,
    terms: { give: { gold: 0, shard: 0 }, ask: { gold: ask, shard: 0 } },
    ...(extendsTruce ? { extendsTruce } : {})
  });
  const verdictFor = (s: TradeSelection) => tradeVerdict({ targetName: "Elin", reply: aiReply, selection: s, own: { gold: 100, shard: 0 }, cooldownRemainingMs: 0 });

  it("a losing AI pays for a new truce but not for an extension", () => {
    expect(verdictFor(selection(50, false)).tone).toBe("good");
    expect(verdictFor(selection(50, true))).toMatchObject({ tone: "bad", text: "Elin won't pay anything to extend a truce." });
    expect(verdictFor(selection(0, true)).tone).toBe("good");
    expect(suggestedDeal(aiReply, selection(0, false), { gold: 100, shard: 0 })).toEqual({ give: { gold: 0, shard: 0 }, ask: { gold: 50, shard: 0 } });
    expect(suggestedDeal(aiReply, selection(0, true), { gold: 100, shard: 0 })).toEqual({ give: { gold: 0, shard: 0 }, ask: { gold: 0, shard: 0 } });
  });
});
