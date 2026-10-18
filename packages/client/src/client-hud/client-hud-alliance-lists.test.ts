// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { playerNameForOwnerFromState } from "../client-owner-name/client-owner-name.js";
import { bindProposeButtons } from "../client-alliance/client-alliance-propose-buttons.js";
import { renderAllianceLists } from "./client-hud-alliance-lists.js";
import { closeDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";

describe("alliance list AI names", () => {
  it("shows seasonal names on desktop and mobile while requests use the diplomacy name", () => {
    const state = createInitialState();
    state.me = "player-1";
    state.metPlayerIds.add("ai-1");
    state.expandedSocialPlayerId = "ai-1";
    state.playerNames.set("ai-1", "AI 1");
    state.leaderboard.byTiles = [{ id: "ai-1", name: "Freja Sund", rank: 1, value: 8 }];
    const dom = { alliesListEl: document.createElement("div"), mobileAlliesListEl: document.createElement("div") };
    renderAllianceLists(state, dom, (_label, _fallback, render) => render(), "fallback");
    const sendGameMessage = vi.fn(() => true);
    for (const root of [dom.alliesListEl, dom.mobileAlliesListEl]) {
      expect(root.querySelector(".player-link")?.textContent).toBe("Freja Sund");
      expect(root.querySelector(".alliance-player-toggle")?.getAttribute("aria-expanded")).toBe("true");
      bindProposeButtons(root, { playerNameForOwner: (id) => playerNameForOwnerFromState(state, id), sendGameMessage, state });
      root.querySelector<HTMLButtonElement>(".propose-alliance")!.click();
      root.querySelector<HTMLButtonElement>(".propose-truce")!.click();
      document.querySelector<HTMLButtonElement>("[data-trade-send]")!.click();
    }
    closeDiplomacyTradeScreen();
    // The trade screen addresses the target by its diplomacy name, not the seasonal display name.
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "DIPLOMACY_STANCE_REQUEST", targetPlayerName: "AI 1" }, expect.any(String));
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "TRUCE_REQUEST", targetPlayerName: "AI 1", durationHours: 12 }, expect.any(String));
    state.allies = ["ai-1"];
    renderAllianceLists(state, dom, (_label, _fallback, render) => render(), "fallback");
    expect(dom.alliesListEl.querySelector(".player-link")?.textContent).toBe("Freja Sund");
  });

  it("keeps seasonal names on pending requests without rewriting social state", () => {
    const state = createInitialState();
    state.me = "player-1";
    state.playerNames.set("ai-1", "AI 1");
    state.leaderboard.byTiles = [{ id: "ai-1", name: "Freja Sund", rank: 1, value: 8 }];
    const request = { id: "r1", fromPlayerId: "player-1", toPlayerId: "ai-1", fromName: "You", toName: "AI 1", createdAt: Date.now() };
    const dom = { alliesListEl: document.createElement("div"), mobileAlliesListEl: document.createElement("div") };
    state.outgoingAllianceRequests = [request];
    renderAllianceLists(state, dom, (_label, _fallback, render) => render(), "fallback");
    expect(dom.alliesListEl.querySelector(".player-link")?.textContent).toBe("Freja Sund");
    state.outgoingAllianceRequests = [];
    state.incomingTruceRequests = [{ ...request, fromPlayerId: "ai-1", toPlayerId: "player-1", fromName: "AI 1", toName: "You", durationHours: 12, expiresAt: Date.now() + 60_000 }];
    renderAllianceLists(state, dom, (_label, _fallback, render) => render(), "fallback");
    expect(dom.mobileAlliesListEl.querySelector(".player-link")?.textContent).toBe("Freja Sund");
    expect(request.toName).toBe("AI 1");
    expect(state.incomingTruceRequests[0]?.fromName).toBe("AI 1");
  });
});
