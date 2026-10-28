// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { giftView } from "@border-empires/shared";

import { closeDiplomacyTradeScreen, GIFT_RESULT_WAIT_MS, openDiplomacyTradeScreen, receiveDiplomacyGiftResult, receiveDiplomacyStance } from "./client-diplomacy-trade.js";
import { giftVerdict, suggestedGift } from "./client-diplomacy-gift-view.js";
import type { DiplomacyStanceReply, TradeSelection } from "./client-diplomacy-trade-view.js";

// Elin as in the bug report: Cautious at -10 because your borders are contested.
const elin: DiplomacyStanceReply = {
  found: true,
  targetPlayerName: "Elin",
  targetPlayerId: "ai-2",
  ai: true,
  stance: { kind: "SEEKING_PEACE", reason: "Elin is looking for peace: their armies are spent." },
  attitude: { level: "CAUTIOUS", score: -10, modifiers: [{ label: "Our borders are contested", value: -10 }] },
  allianceRefusal: "Elin doesn't think well enough of you for an alliance. Offer a gift to win them over.",
  pricing: { required: { truce12: 0, truce24: 0, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 50, shard: 0 } },
  gift: giftView(0, 60) // 10 coin per opinion point
};
const giving = (gold: number, shard = 0): TradeSelection => ({ kind: "gift", durationHours: 12, terms: { give: { gold, shard }, ask: { gold: 0, shard: 0 } } });
const verdict = (selection: TradeSelection, own = { gold: 500, shard: 0 }, reply: DiplomacyStanceReply | undefined = elin) =>
  giftVerdict({ targetName: "Elin", reply, selection, own });

describe("giftVerdict", () => {
  it("says what a gift does to the AI's opinion before it is sent", () => {
    expect(verdict(giving(100))).toEqual(
      expect.objectContaining({
        tone: "good",
        canSend: true,
        sendLabel: "Offer gift",
        text: "Elin's opinion of you: +10 (still Cautious). About 96 more coin would make them Pleased, enough for an alliance. Gifts count for up to +25 in all and lose half their effect each day."
      })
    );
    expect(verdict(giving(195)).text).toBe("Elin's opinion of you: +20 (Cautious → Pleased). Pleased is enough for an alliance. Gifts count for up to +25 in all and lose half their effect each day.");
    expect(verdict(giving(0, 8), { gold: 0, shard: 8 }).text).toContain("+20 (Cautious → Pleased)");
  });

  it("won't send a gift that changes nothing", () => {
    expect(verdict(giving(0))).toEqual(expect.objectContaining({ canSend: false }));
    expect(verdict(giving(3))).toEqual(expect.objectContaining({ canSend: false, text: "Too small to change Elin's opinion: +1 costs about 10 coin." }));
    const capped = { ...elin, gift: giftView(10_000, 60) };
    expect(verdict(giving(100), undefined, capped)).toEqual(expect.objectContaining({ canSend: false }));
    // Past the +25 cap the extra coin buys nothing, so it isn't taken.
    expect(verdict(giving(300))).toEqual(
      expect.objectContaining({ canSend: false, text: "Only about 250 coin of this would count: gifts add up to +25 opinion in all. Give 250 coin or less." })
    );
    expect(verdict(giving(250)).canSend).toBe(true);
    expect(verdict(giving(600))).toEqual(expect.objectContaining({ canSend: false, text: "You only have 500 coin and 0 Shards." }));
    expect(verdict(giving(50), undefined, { found: true, targetPlayerName: "Ada", targetPlayerId: "p2", ai: false })).toEqual(
      expect.objectContaining({ canSend: false, text: "Only AI empires take gifts." })
    );
  });

  it("suggests the least coin that makes the AI Pleased, when affordable", () => {
    expect(suggestedGift(elin, { gold: 500, shard: 0 })).toEqual({ give: { gold: 196, shard: 0 }, ask: { gold: 0, shard: 0 } });
    expect(suggestedGift(elin, { gold: 100, shard: 0 })).toBeUndefined();
  });
});

describe("gift on the trade screen", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  it("offers a gift to an AI, keeps the screen open and shows the outcome", () => {
    const send = vi.fn().mockReturnValue(true);
    // During a truce only an alliance or a gift can be chosen.
    openDiplomacyTradeScreen(
      { targetName: "Elin", targetPlayerId: "ai-2", kind: "truce", durationHours: 12 },
      { send, ownHoldings: () => ({ gold: 500, shard: 0 }), truceEndsAt: () => Date.now() + 6 * 60_000 }
    );
    const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
    const giftButton = overlay.querySelector<HTMLButtonElement>("[data-trade-kind='gift:0']")!;
    expect(giftButton.hidden).toBe(true);
    receiveDiplomacyStance(elin);
    expect(giftButton.hidden).toBe(false);
    giftButton.click();
    expect(overlay.querySelector<HTMLElement>("[data-trade-side='ask']")!.hidden).toBe(true);
    overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]")!.click();
    expect(overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!.value).toBe("196");
    const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!;
    expect(sendButton.textContent).toBe("Offer gift");
    sendButton.click();
    expect(send).toHaveBeenLastCalledWith({ type: "DIPLOMACY_GIFT", targetPlayerName: "Elin", targetPlayerId: "ai-2", gift: { gold: 196, shard: 0 } }, expect.any(String));
    expect(document.querySelector(".diplomacy-trade-overlay")).not.toBeNull();
    expect(sendButton.disabled).toBe(true);

    receiveDiplomacyGiftResult({ ok: true, targetPlayerName: "Elin", targetPlayerId: "ai-2", message: "You gave Elin 196 coin as a gift." });
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("You gave Elin 196 coin as a gift.");
    expect(overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!.value).toBe("0");
  });

  // A lost reply (e.g. a reconnect) must not leave Send disabled for good.
  it("stops waiting on a gift that never gets an answer", () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn().mockReturnValue(true);
      openDiplomacyTradeScreen({ targetName: "Elin", targetPlayerId: "ai-2", kind: "alliance", durationHours: 12 }, { send, ownHoldings: () => ({ gold: 500, shard: 0 }) });
      const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
      receiveDiplomacyStance(elin);
      overlay.querySelector<HTMLButtonElement>("[data-trade-kind='gift:0']")!.click();
      overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]")!.click();
      const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!;
      sendButton.click();
      expect(sendButton.disabled).toBe(true);
      vi.advanceTimersByTime(GIFT_RESULT_WAIT_MS);
      expect(sendButton.disabled).toBe(false);
      expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("No word yet on your gift to Elin. Check your coin before sending another.");
      // A reply that turns up after that no longer rewrites the screen.
      receiveDiplomacyGiftResult({ ok: true, targetPlayerName: "Elin", targetPlayerId: "ai-2", message: "You gave Elin 196 coin as a gift." });
      expect(overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!.value).toBe("196");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the gift for human players", () => {
    openDiplomacyTradeScreen({ targetName: "Ada", kind: "truce", durationHours: 12 }, { send: vi.fn().mockReturnValue(true), ownHoldings: () => ({ gold: 500, shard: 0 }) });
    receiveDiplomacyStance({ found: true, targetPlayerName: "Ada", targetPlayerId: "p2", ai: false });
    expect(document.querySelector<HTMLButtonElement>("[data-trade-kind='gift:0']")!.hidden).toBe(true);
  });
});
