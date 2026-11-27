// @vitest-environment happy-dom
// Owner decision 2026-11-27 (playtest: a 41-tile House allied the #1 and #2
// empires for 0-16 coin and it read as a generic alliance): every surface that
// names an alliance between clearly unequal empires names it as fealty.
import { describe, expect, it, vi } from "vitest";

import type { PersonalActivityDiplomacyCard } from "@border-empires/game-domain";
import type { LeaderboardOverallEntry } from "../client-types.js";
import { diplomacyCardText } from "../client-activity-dashboard/client-activity-dashboard-diplomacy-text.js";
import { handleDiplomacySocketMessage } from "../client-diplomacy-notifications/client-diplomacy-messages.js";
import { offerDockEntries } from "../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js";
import { closeDiplomacyTradeScreen, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { dealSummaryHtml } from "../client-diplomacy-trade/client-diplomacy-trade-deal.js";
import { diplomacyTradeDepsFor } from "../client-diplomacy-trade/client-diplomacy-trade-deps.js";
import { tradeVerdict, type TradeSelection } from "../client-diplomacy-trade/client-diplomacy-trade-view.js";
import { dealPactHtml } from "../client-hud-v2/client-hud-v2-diplomacy-pact.js";
import { diplomacyListHtml, empireStance } from "../client-hud-v2/client-hud-v2-diplomacy.js";
import { diplomacyActionForOwner } from "../client-tile-action-diplomacy/client-tile-action-diplomacy.js";
import { fealtyLookupFor } from "./client-fealty.js";

const rank = (id: string, tiles: number, position: number): LeaderboardOverallEntry => ({ id, name: id, tiles, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: tiles, rank: position });
// You hold 41 garrisoned tiles: "big" has 900 (SWEAR), "peer" 60 (ALLIANCE), "small" 10 (DEMAND).
const leaderboard = { overall: [rank("big", 900, 1), rank("peer", 60, 2), rank("me", 41, 3), rank("small", 10, 4)], selfOverall: rank("me", 41, 3) };
const fealtyWith = fealtyLookupFor({ me: "me", leaderboard });
const request = (id: string, fromPlayerId: string, toPlayerId: string) => ({ id, fromPlayerId, toPlayerId, createdAt: 0, fromName: fromPlayerId, toName: toPlayerId });

describe("deal screen", () => {
  const alliance: TradeSelection = { kind: "alliance", durationHours: 12, terms: { give: { gold: 0 }, ask: { gold: 0 } } };
  const human = { found: true as const, targetPlayerName: "big", targetPlayerId: "big", ai: false };
  const verdict = (fealty: "SWEAR" | "DEMAND" | "ALLIANCE") =>
    tradeVerdict({ targetName: "big", reply: human, selection: alliance, own: { gold: 0 }, cooldownRemainingMs: 0, fealty });

  it("labels the send button and the deal line by who is larger", () => {
    expect(verdict("SWEAR").sendLabel).toBe("Swear fealty");
    expect(verdict("DEMAND").sendLabel).toBe("Demand fealty");
    expect(verdict("ALLIANCE").sendLabel).toBe("Propose alliance");
    expect(dealSummaryHtml({ selection: alliance, treaty: "alliance", targetName: "big", fealty: "SWEAR" })).toContain("<span>Swear fealty</span>");
    expect(dealSummaryHtml({ selection: alliance, treaty: "alliance", targetName: "big" })).toContain("<span>Alliance</span>");
  });

  it("says the bloc's land is won by its largest member", () => {
    expect(verdict("SWEAR").text).toContain("won by its largest member");
  });

  it("relabels the treaty button on the open deal screen", () => {
    openDiplomacyTradeScreen({ targetName: "small", targetPlayerId: "small", kind: "alliance", durationHours: 12 }, { send: vi.fn(), ownHoldings: () => ({ gold: 0 }), fealtyWith });
    expect(document.querySelector('[data-trade-kind="alliance:0"]')?.textContent).toBe("Demand fealty");
    closeDiplomacyTradeScreen();
  });

  it("reads each target's standing from the client's leaderboard", () => {
    const deps = diplomacyTradeDepsFor({ me: "me", gold: 0, leaderboard }, vi.fn());
    expect(deps.fealtyWith?.("big")).toBe("SWEAR");
    expect(deps.fealtyWith?.("small")).toBe("DEMAND");
    expect(deps.fealtyWith?.("peer")).toBe("ALLIANCE");
  });
});

describe("offer the recipient sees", () => {
  it("reads 'swears fealty' / 'demands your fealty' / 'proposes an alliance'", () => {
    const state = { me: "me", leaderboard, incomingTruceRequests: [], incomingAllianceRequests: [request("a1", "small", "me"), request("a2", "big", "me"), request("a3", "peer", "me")] };
    const headlines = Object.fromEntries(offerDockEntries(state, new Map(), new Set(), 0, () => undefined).map((e) => [e.fromName, e.headline]));
    expect(headlines).toEqual({ small: "swears fealty", big: "demands your fealty", peer: "proposes an alliance" });
  });
});

describe("Diplomacy list and ally status", () => {
  const base = { me: "me", metPlayerIds: new Set<string>(), activeTruces: [], incomingTruce: [], leaderboard: leaderboard.overall, nameOf: (id: string) => id, colorOf: () => undefined, nowMs: 0, fealtyWith };

  it("shows a liege, a sworn House and a plain ally", () => {
    expect(empireStance("big", { ...base, allies: ["big"] }).label).toBe("Your liege");
    expect(empireStance("small", { ...base, allies: ["small"] }).label).toBe("Sworn to you");
    expect(empireStance("peer", { ...base, allies: ["peer"] }).label).toBe("Ally");
    expect(empireStance("big", { allies: ["big"], activeTruces: [], nowMs: 0 }).label).toBe("Ally");
  });

  it("words incoming and sent offers", () => {
    const html = diplomacyListHtml({ ...base, allies: [], incomingAlliance: [request("a1", "small", "me")], outgoingAlliance: [request("a2", "me", "big")] });
    expect(html).toContain("Swears fealty");
    expect(html).toContain("Fealty offered");
  });

  it("names the pact and the tile menu entry", () => {
    expect(dealPactHtml({ targetId: "big", allies: ["big"], activeTruces: [], activeAllianceBreaks: [], nowMs: 0, allyLabel: "Your liege" })).toContain(">Your liege<");
    expect(dealPactHtml({ targetId: "big", allies: ["big"], activeTruces: [], activeAllianceBreaks: [], nowMs: 0 })).toContain(">Allied<");
    const tileState = { me: "me", leaderboard, allies: ["small", "peer"], incomingAllianceRequests: [], outgoingAllianceRequests: [], incomingTruceRequests: [], outgoingTruceRequests: [] };
    const deps = { activeTruceWithPlayer: () => undefined };
    expect(diplomacyActionForOwner(tileState, "small", deps).detail).toBe("Sworn to you");
    expect(diplomacyActionForOwner(tileState, "peer", deps).detail).toBe("Allied");
  });
});

describe("feed", () => {
  const state = () => ({
    me: "me", leaderboard,
    notifiedIncomingDiplomacyRequestIds: new Set<string>(), notifiedDiplomacyIdsLoadedFor: "",
    allies: [] as string[], activeAllianceBreaks: [], recentAllianceBreaks: [],
    incomingAllianceRequests: [] as ReturnType<typeof request>[], outgoingAllianceRequests: [] as ReturnType<typeof request>[],
    activeTruces: [], truceBreaksThisSeason: [], incomingTruceRequests: [], outgoingTruceRequests: []
  });
  const deps = () => ({ pushFeed: vi.fn(), showCaptureAlert: vi.fn(), playerNameForOwner: () => undefined });

  it("logs a sent offer and an incoming one as fealty", () => {
    const d = deps();
    handleDiplomacySocketMessage(state(), { type: "ALLIANCE_REQUESTED", request: request("a1", "me", "big"), targetName: "Big" }, d);
    handleDiplomacySocketMessage(state(), { type: "ALLIANCE_REQUEST_INCOMING", request: request("a2", "small", "me"), fromName: "Small" }, d);
    expect(d.pushFeed).toHaveBeenNthCalledWith(1, "Fealty offered to Big.", "alliance", "success");
    expect(d.pushFeed).toHaveBeenNthCalledWith(2, "Small swears fealty.", "alliance", "info");
  });

  it("rewords the answer to your offer; an accepted offer does not pop up", () => {
    const d = deps();
    const s = state();
    s.outgoingAllianceRequests = [request("a1", "me", "big")];
    handleDiplomacySocketMessage(s, { type: "ALLIANCE_UPDATE", allies: ["big"], outgoingAllianceRequests: [], announcement: "Big accepted your alliance. Big trusts you." }, d);
    expect(d.pushFeed).toHaveBeenCalledWith("Big accepted your fealty. Big trusts you.", "alliance", "success");
    expect(d.showCaptureAlert).not.toHaveBeenCalled();
  });
});

describe("Chronicle", () => {
  const card = (event: PersonalActivityDiplomacyCard["event"], counterpartyPlayerId: string, byPlayerId?: string): PersonalActivityDiplomacyCard => ({
    kind: "DIPLOMACY", id: "c", occurredAt: 0, event, counterpartyPlayerId, counterpartyName: counterpartyPlayerId, ...(byPlayerId ? { byPlayerId } : {})
  });
  const text = (c: PersonalActivityDiplomacyCard) => diplomacyCardText(c, "me", () => undefined, 0, fealtyWith);

  it("words formed, offered and declined alliances as fealty between unequal empires", () => {
    expect(text(card("ALLIANCE_FORMED", "big"))).toBe("You swore fealty to big");
    expect(text(card("ALLIANCE_FORMED", "small"))).toBe("small swore fealty to you");
    expect(text(card("ALLIANCE_OFFERED", "big", "me"))).toBe("You offered big your fealty");
    expect(text(card("ALLIANCE_OFFERED", "big", "big"))).toBe("big demanded your fealty");
    expect(text(card("ALLIANCE_DECLINED", "small", "small"))).toBe("small refused to swear fealty");
  });

  it("keeps alliance wording between near-equals and for a broken alliance", () => {
    expect(text(card("ALLIANCE_FORMED", "peer"))).toBe("Alliance with peer formed");
    expect(text(card("ALLIANCE_BROKEN", "big"))).toBe("Alliance with big ended");
  });
});
