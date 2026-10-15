// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiDiplomacyPricing } from "@border-empires/shared";

import {
  closeDiplomacyTradeScreen,
  openDiplomacyTradeScreen,
  receiveDiplomacyStance,
  setDiplomacyOfferCooldowns
} from "./client-diplomacy-trade.js";
import { diplomacyTermsLineHtml } from "./client-diplomacy-terms-html.js";
import { tradeVerdict, type DiplomacyStanceReply, type TradeSelection } from "./client-diplomacy-trade-view.js";

const pricing: AiDiplomacyPricing = { required: { truce12: 40, truce24: 60, alliance: null }, shardCoinValue: 25, aiHoldings: { gold: 30, shard: 0 } };
const aiReply: DiplomacyStanceReply = {
  found: true,
  targetPlayerName: "Milo",
  targetPlayerId: "ai-1",
  ai: true,
  stance: { kind: "WARY", reason: "Milo is wary of you." },
  pricing
};
const selection = (giveGold = 0, kind: TradeSelection["kind"] = "truce", durationHours: 12 | 24 = 12): TradeSelection => ({
  kind,
  durationHours,
  terms: { give: { gold: giveGold, shard: 0 }, ask: { gold: 0, shard: 0 } }
});
const verdict = (overrides: Partial<Parameters<typeof tradeVerdict>[0]>) =>
  tradeVerdict({ targetName: "Milo", reply: aiReply, selection: selection(), own: { gold: 100, shard: 0 }, cooldownRemainingMs: 0, ...overrides });

describe("tradeVerdict", () => {
  it("previews an AI's answer with the shared pricing rules", () => {
    expect(verdict({ selection: selection(40) })).toEqual(expect.objectContaining({ tone: "good", text: "Milo would accept a 12h truce on these terms." }));
    expect(verdict({})).toEqual(expect.objectContaining({ tone: "bad", text: "Milo would refuse: wants about 40 more coin.", topUpCoin: 40 }));
    expect(verdict({ selection: selection(0, "alliance") }).text).toBe("Milo won't agree to an alliance at any price right now.");
  });

  // A player with 10 coin is told the price is out of reach, not offered a top-up they can't pay.
  it("says when the price is more than the player can offer", () => {
    expect(verdict({ own: { gold: 10, shard: 0 } })).toEqual(
      expect.objectContaining({ text: "Milo wants about 40 coin for this, more than you can offer.", canSend: true })
    );
    expect(verdict({ own: { gold: 10, shard: 0 } })).not.toHaveProperty("topUpCoin");
  });

  it("blocks sending during the re-offer cooldown and when giving more than you hold", () => {
    expect(verdict({ cooldownRemainingMs: 23 * 60_000 + 1 })).toEqual(expect.objectContaining({ canSend: false, sendLabel: "Can offer again in 24m" }));
    expect(verdict({ selection: selection(500) })).toEqual(expect.objectContaining({ canSend: false }));
  });

  it("has no prediction for human players or unreadable AIs, but still allows sending", () => {
    expect(verdict({ reply: { found: true, targetPlayerName: "Valka", targetPlayerId: "p2", ai: false }, targetName: "Valka" })).toEqual(
      expect.objectContaining({ tone: "neutral", canSend: true })
    );
    expect(verdict({ reply: { ...aiReply, pricing: undefined } } as never)).toEqual(expect.objectContaining({ tone: "neutral", canSend: true }));
  });
});

describe("diplomacy trade screen", () => {
  afterEach(() => {
    closeDiplomacyTradeScreen();
    setDiplomacyOfferCooldowns([]);
  });

  const openScreen = (gold = 100) => {
    const send = vi.fn().mockReturnValue(true);
    openDiplomacyTradeScreen({ targetName: "Milo", kind: "truce", durationHours: 12 }, { send, ownHoldings: () => ({ gold, shard: 0 }) });
    const overlay = document.querySelector<HTMLElement>(".diplomacy-trade-overlay")!;
    return { send, overlay };
  };

  it("asks the gateway for the target's stance, then shows it with a live verdict", () => {
    const { send, overlay } = openScreen();
    expect(send).toHaveBeenCalledWith({ type: "DIPLOMACY_STANCE_REQUEST", targetPlayerName: "Milo" }, expect.any(String));
    receiveDiplomacyStance(aiReply);
    expect(overlay.querySelector("[data-trade-stance]")?.textContent).toBe("Wary. Milo is wary of you.");
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Milo would refuse: wants about 40 more coin.");

    overlay.querySelector<HTMLButtonElement>("[data-trade-topup]")!.click();
    expect(overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!.value).toBe("40");
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Milo would accept a 12h truce on these terms.");
  });

  it("sends the offer with its terms and closes", () => {
    const { send, overlay } = openScreen();
    const giveGold = overlay.querySelector<HTMLInputElement>("[data-trade-give-gold]")!;
    giveGold.value = "25";
    giveGold.dispatchEvent(new Event("input"));
    overlay.querySelector<HTMLButtonElement>("[data-trade-kind='truce:24']")!.click();
    overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();

    expect(send).toHaveBeenLastCalledWith(
      { type: "TRUCE_REQUEST", targetPlayerName: "Milo", durationHours: 24, terms: { give: { gold: 25, shard: 0 }, ask: { gold: 0, shard: 0 } } },
      expect.any(String)
    );
    expect(document.querySelector(".diplomacy-trade-overlay")).toBeNull();
  });

  it("sends a plain offer when no terms are set", () => {
    const { send, overlay } = openScreen();
    overlay.querySelector<HTMLButtonElement>("[data-trade-kind='alliance:0']")!.click();
    overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    expect(send).toHaveBeenLastCalledWith({ type: "ALLIANCE_REQUEST", targetPlayerName: "Milo" }, expect.any(String));
  });

  it("shows the re-offer countdown once the target is known", () => {
    setDiplomacyOfferCooldowns([{ kind: "truce", targetPlayerId: "ai-1", until: Date.now() + 10 * 60_000 }]);
    const { overlay } = openScreen();
    receiveDiplomacyStance(aiReply);
    const sendButton = overlay.querySelector<HTMLButtonElement>("[data-trade-send]")!;
    expect(sendButton.disabled).toBe(true);
    expect(sendButton.textContent).toBe("Can offer again in 10m");
  });

  it("ignores a stance reply for a different target", () => {
    const { overlay } = openScreen();
    receiveDiplomacyStance({ ...aiReply, targetPlayerName: "Valka" });
    expect(overlay.querySelector("[data-trade-verdict]")?.textContent).toBe("Reading Milo's mood…");
  });
});

describe("diplomacyTermsLineHtml", () => {
  const terms = { give: { gold: 50, shard: 0 }, ask: { gold: 0, shard: 2 } };
  it("words terms from the viewer's side and escapes names", () => {
    expect(diplomacyTermsLineHtml(terms, "incoming", "Milo")).toContain("Milo pays 50 coin; you pay 2 Shards");
    expect(diplomacyTermsLineHtml(terms, "outgoing", "<b>")).toContain("you pay 50 coin; &lt;b&gt; pays 2 Shards");
    expect(diplomacyTermsLineHtml(undefined, "incoming", "Milo")).toBe("");
  });
});
