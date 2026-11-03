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
  // Gifts can still win Elin over, so an alliance is priced as tribute: 196 coin to Pleased plus 24h of income.
  pricing: { required: { truce12: 0, truce24: 0, alliance: 196 + 1440 }, aiHoldings: { gold: 50 } },
  gift: giftView(0, 60) // 10 coin per opinion point
};
const giving = (gold: number): TradeSelection => ({ kind: "gift", durationHours: 12, terms: { give: { gold }, ask: { gold: 0 } } });
const verdict = (selection: TradeSelection, own = { gold: 500 }, reply: DiplomacyStanceReply | undefined = elin) =>
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
  });

  // Regression: a gift was sold as "enough for an alliance" while the AI already refused one on bloc size.
  it("doesn't promise an alliance the AI refuses for reasons opinion can't change", () => {
    const refusal = "Elin won't help a larger empire toward Diplomatic Dominance: together you'd hold too much land for it to join without leading.";
    const refusing = { ...elin, allianceRefusal: refusal };
    expect(verdict(giving(195), undefined, refusing).text).toBe(
      `Elin's opinion of you: +20 (Cautious → Pleased). Gifts won't win an alliance right now: ${refusal} Gifts count for up to +25 in all and lose half their effect each day.`
    );
    expect(verdict(giving(100), undefined, refusing).text).not.toContain("enough for an alliance");
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
    expect(verdict(giving(600))).toEqual(expect.objectContaining({ canSend: false, text: "You only have 500 coin." }));
    expect(verdict(giving(50), undefined, { found: true, targetPlayerName: "Ada", targetPlayerId: "p2", ai: false })).toEqual(
      expect.objectContaining({ canSend: false, text: "Only AI empires take gifts." })
    );
  });

  it("suggests the least coin that makes the AI Pleased, when affordable", () => {
    expect(suggestedGift(elin, { gold: 500 })).toEqual({ give: { gold: 196 }, ask: { gold: 0 } });
    expect(suggestedGift(elin, { gold: 100 })).toBeUndefined();
  });
});

describe("gift on the trade screen", () => {
  afterEach(() => closeDiplomacyTradeScreen());

  it("offers a gift to an AI, keeps the screen open and shows the outcome", () => {
    const send = vi.fn().mockReturnValue(true);
    // A gift works during a truce too.
    openDiplomacyTradeScreen(
      { targetName: "Elin", targetPlayerId: "ai-2", kind: "truce", durationHours: 12 },
      { send, ownHoldings: () => ({ gold: 500 }), runningTruce: () => ({ startedAt: Date.now(), endsAt: Date.now() + 6 * 60_000 }) }
    );
    const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
    receiveDiplomacyStance(elin);
    // Taking the truce out of the deal leaves nothing but what you give: a gift.
    overlay.querySelector<HTMLButtonElement>("[data-deal-remove='treaty']")!.click();
    expect(overlay.querySelector("[data-trade-kind][aria-pressed='true']")).toBeNull();
    expect(overlay.querySelector("[data-trade-deal]")?.textContent).toContain("Nothing in the deal yet.");
    const suggest = overlay.querySelector<HTMLButtonElement>("[data-trade-suggest]")!;
    expect(suggest.textContent).toBe("Suggest gift");
    suggest.click();
    expect(overlay.querySelector("[data-deal-side='give']")?.textContent).toContain("196 Coin");
    // A gift asks for nothing back.
    expect(overlay.querySelector("[data-deal-side='ask']")).toBeNull();
    expect(overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!.value).toBe("196");
    const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!;
    expect(sendButton.textContent).toBe("Offer gift");
    sendButton.click();
    expect(send).toHaveBeenLastCalledWith({ type: "DIPLOMACY_GIFT", targetPlayerName: "Elin", targetPlayerId: "ai-2", gift: { gold: 196 } }, expect.any(String));
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
      openDiplomacyTradeScreen({ targetName: "Elin", targetPlayerId: "ai-2", kind: "alliance", durationHours: 12 }, { send, ownHoldings: () => ({ gold: 500 }) });
      const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
      receiveDiplomacyStance(elin);
      overlay.querySelector<HTMLButtonElement>("[data-deal-remove='treaty']")!.click();
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

  it("does not send gifts to human players", () => {
    openDiplomacyTradeScreen({ targetName: "Ada", kind: "gift", durationHours: 12 }, { send: vi.fn().mockReturnValue(true), ownHoldings: () => ({ gold: 500 }) });
    receiveDiplomacyStance({ found: true, targetPlayerName: "Ada", targetPlayerId: "p2", ai: false });
    const exact = document.querySelector<HTMLInputElement>("[data-trade-exact='give-gold']")!;
    exact.value = "50";
    exact.dispatchEvent(new Event("input"));
    // Humans take no gifts: giving coin alone is not a deal until a treaty or supply is added.
    expect(document.querySelector("[data-trade-verdict]")?.textContent).toContain("Coin changes hands with a truce");
    expect(document.querySelector<HTMLButtonElement>("[data-trade-send]")!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("[data-trade-suggest]")!.hidden).toBe(true);
  });
});
