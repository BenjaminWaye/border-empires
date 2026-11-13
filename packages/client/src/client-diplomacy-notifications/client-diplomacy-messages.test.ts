// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen, setDiplomacyOfferCooldowns } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { handleDiplomacySocketMessage } from "./client-diplomacy-messages.js";

const state = () => ({
  me: "p1",
  notifiedIncomingDiplomacyRequestIds: new Set<string>(),
  notifiedDiplomacyIdsLoadedFor: "",
  allies: [] as string[],
  activeAllianceBreaks: [],
  recentAllianceBreaks: [],
  incomingAllianceRequests: [],
  outgoingAllianceRequests: [],
  activeTruces: [],
  truceBreaksThisSeason: [],
  incomingTruceRequests: [],
  outgoingTruceRequests: []
});
const deps = () => ({ pushFeed: vi.fn(), showCaptureAlert: vi.fn(), playerNameForOwner: () => undefined });

describe("handleDiplomacySocketMessage", () => {
  afterEach(() => {
    closeDiplomacyTradeScreen();
    setDiplomacyOfferCooldowns([]);
  });

  // Playtest 2026-11-12: a truce offer logged "Truce offered to X." but an alliance offer logged nothing,
  // so a player who missed the popup couldn't tell whether it went.
  it("logs a sent alliance offer like a sent truce offer, and keeps it as pending", () => {
    const handlerDeps = deps();
    const s = state();
    const request = { id: "a1", fromPlayerId: "p1", toPlayerId: "p2", createdAt: 0 };
    handleDiplomacySocketMessage(s, { type: "ALLIANCE_REQUESTED", request, targetName: "Sam's Meadow" }, handlerDeps);
    expect(handlerDeps.pushFeed).toHaveBeenCalledWith("Alliance offered to Sam's Meadow.", "alliance", "success");
    expect(s.outgoingAllianceRequests).toEqual([request]);
  });

  it("routes stance replies and re-offer cooldowns to the open trade screen", () => {
    openDiplomacyTradeScreen({ targetName: "Milo", kind: "truce", durationHours: 12 }, { send: () => true, ownHoldings: () => ({ gold: 0 }) });
    const handlerDeps = deps();
    expect(
      handleDiplomacySocketMessage(state(), { type: "DIPLOMACY_STANCE", found: true, targetPlayerName: "Milo", targetPlayerId: "ai-1", ai: false }, handlerDeps)
    ).toBe(true);
    expect(
      handleDiplomacySocketMessage(state(), { type: "TRUCE_UPDATE", offerCooldowns: [{ kind: "truce", targetPlayerId: "ai-1", until: Date.now() + 5 * 60_000 }] }, handlerDeps)
    ).toBe(true);
    expect(document.querySelector("[data-trade-send]")?.textContent).toBe("Can offer again in 5m");
  });

  it("shows an incoming counter-offer's terms in its notification", () => {
    const handlerDeps = deps();
    const request = {
      id: "t1",
      fromPlayerId: "ai-1",
      toPlayerId: "p1",
      createdAt: 0,
      expiresAt: 1,
      durationHours: 12,
      fromName: "Milo",
      terms: { give: { gold: 0 }, ask: { gold: 60 } }
    };
    handleDiplomacySocketMessage(state(), { type: "TRUCE_REQUEST_INCOMING", request }, handlerDeps);
    expect(handlerDeps.pushFeed).toHaveBeenCalledWith("Milo offered a 12h truce (you pay 60 coin).", "alliance", "warn");
  });

  it("words an incoming truce extension as an extension", () => {
    const handlerDeps = deps();
    const request = { id: "t2", fromPlayerId: "ai-1", toPlayerId: "p1", createdAt: 0, expiresAt: 1, durationHours: 24, fromName: "Milo", extendsTruce: true };
    handleDiplomacySocketMessage(state(), { type: "TRUCE_REQUEST_INCOMING", request }, handlerDeps);
    expect(handlerDeps.pushFeed).toHaveBeenCalledWith("Milo offered to extend your truce by 24h.", "alliance", "warn");
  });

  it("leaves other messages alone", () => {
    expect(handleDiplomacySocketMessage(state(), { type: "PLAYER_UPDATE" }, deps())).toBe(false);
  });
});
