// @vitest-environment happy-dom
// Playtest run 5 (pt-spender): right after signing a truce with Elin, Diplomacy
// listed her under "Not met yet" ("Empires you've met · 0"). Any empire you
// have, or had, a truce, alliance or pending offer with now counts as met.
import { beforeEach, describe, expect, it } from "vitest";

import { registerHintStateSender } from "../client-discovery-tips/client-hint-server-sync.js";
import { diplomacyListHtml } from "../client-hud-v2/client-hud-v2-diplomacy.js";
import { refreshMetPlayerIds } from "./client-met-players.js";

const makeState = () => ({
  me: "me",
  bridgeDebugSeasonId: "season-1",
  tiles: new Map(),
  tilesRevision: 1,
  metPlayerIds: new Set<string>(),
  metPlayersScannedRevision: -1,
  metPlayersLoadedFor: "",
  metPlayersSavedCount: -1
});
const offer = (id: string, fromPlayerId: string, toPlayerId: string) => ({ id, fromPlayerId, toPlayerId, createdAt: 0, expiresAt: 1, durationHours: 12 as const });

beforeEach(() => {
  window.localStorage.clear();
  registerHintStateSender(() => undefined);
});

describe("met empires from diplomacy", () => {
  it("counts a truce offer in flight and keeps the partner met after the truce ends", () => {
    const state = { ...makeState(), outgoingTruceRequests: [offer("t1", "me", "elin")], activeTruces: [] as Array<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }> };
    refreshMetPlayerIds(state);
    // The offer is answered and the truce later runs out: Elin stays met.
    state.outgoingTruceRequests = [];
    state.activeTruces = [{ otherPlayerId: "elin", otherPlayerName: "Elin", startedAt: 0, endsAt: 1, createdByPlayerId: "elin" }];
    refreshMetPlayerIds(state);
    state.activeTruces = [];
    expect([...refreshMetPlayerIds(state)]).toEqual(["elin"]);
    const html = diplomacyListHtml({
      me: "me", metPlayerIds: refreshMetPlayerIds(state), allies: [], activeTruces: [], incomingAlliance: [], incomingTruce: [],
      leaderboard: [{ id: "elin", name: "Elin", tiles: 111, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 1, rank: 1 }],
      nameOf: (id) => (id === "elin" ? "Elin" : id), colorOf: () => undefined, nowMs: 0
    });
    expect(html).toContain("Empires you've met · 1");
    expect(html).not.toContain("Not met yet");
  });

  it("counts allies, alliance offers both ways, alliances on notice and truces you broke; never barbarians", () => {
    const state = {
      ...makeState(),
      allies: ["ally"],
      incomingAllianceRequests: [offer("a1", "suitor", "me")],
      outgoingAllianceRequests: [offer("a2", "me", "courted")],
      incomingTruceRequests: [offer("t1", "barbarian-1", "me")],
      activeAllianceBreaks: [{ otherPlayerId: "leaving", otherPlayerName: "Leaving", startedAt: 0, endsAt: 1, createdByPlayerId: "me" }],
      recentAllianceBreaks: [{ otherPlayerId: "former", otherPlayerName: "Former", startedAt: 0, endsAt: 1, finalizedAt: 1, createdByPlayerId: "me" }],
      truceBreaksThisSeason: [{ targetPlayerId: "betrayed", targetPlayerName: "Betrayed", brokenAt: 0 }]
    };
    expect([...refreshMetPlayerIds(state)].sort()).toEqual(["ally", "betrayed", "courted", "former", "leaving", "suitor"]);
  });
});
