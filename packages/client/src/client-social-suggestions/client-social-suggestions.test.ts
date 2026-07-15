import { describe, expect, it } from "vitest";

import type { LeaderboardMetricEntry, LeaderboardOverallEntry } from "../client-types.js";
import {
  allianceTargetSuggestionOptionsHtml,
  allianceTargetSuggestions,
  renderAllianceTargetOptionsIfChanged,
  shouldRewriteAllianceTargetOptions
} from "./client-social-suggestions.js";

const emptyLeaderboard: {
  overall: LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  selfByTiles: LeaderboardMetricEntry | undefined;
  selfByIncome: LeaderboardMetricEntry | undefined;
  selfByTechs: LeaderboardMetricEntry | undefined;
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
} = {
  overall: [],
  selfOverall: undefined,
  selfByTiles: undefined,
  selfByIncome: undefined,
  selfByTechs: undefined,
  byTiles: [],
  byIncome: [],
  byTechs: []
};

describe("allianceTargetSuggestions", () => {
  it("collects unique known player names and excludes the local player", () => {
    const names = allianceTargetSuggestions({
      me: "me",
      meName: "Valen",
      playerNames: new Map([
        ["me", "Valen"],
        ["p-1", "Vanguard"],
        ["p-2", "Aurora"]
      ]),
      leaderboard: {
        overall: [
          { id: "p-1", name: "Vanguard", rank: 1, score: 10, tiles: 10, incomePerMinute: 4, techs: 2 },
          { id: "p-3", name: "Valeguard", rank: 2, score: 9, tiles: 9, incomePerMinute: 3, techs: 2 }
        ],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      incomingAllianceRequests: [{ id: "a1", fromPlayerId: "p-4", toPlayerId: "me", fromName: "Vael", createdAt: 1, expiresAt: 2 }],
      outgoingAllianceRequests: [{ id: "a2", fromPlayerId: "me", toPlayerId: "p-5", toName: "Aurora", createdAt: 1, expiresAt: 2 }],
      incomingTruceRequests: [{ id: "t1", fromPlayerId: "p-6", toPlayerId: "me", fromName: "Valkyr", createdAt: 1, expiresAt: 2, durationHours: 12 }],
      outgoingTruceRequests: [],
      activeTruces: [
        {
          otherPlayerId: "p-7",
          otherPlayerName: "Barbarians",
          startedAt: 1,
          endsAt: 2,
          createdByPlayerId: "p-7"
        }
      ]
    });

    expect(names).toEqual(["Aurora", "Vael", "Valeguard", "Valkyr", "Vanguard"]);
  });

  it("renders datalist option markup for suggestion names", () => {
    expect(allianceTargetSuggestionOptionsHtml(["Vanguard", "Valeguard"])).toContain('<option value="Vanguard"></option>');
  });

  it("excludes AI players that are pre-registered but have not settled/founded an empire yet", () => {
    const names = allianceTargetSuggestions({
      me: "player-1",
      meName: "Nauticus",
      playerNames: new Map([
        ["player-1", "Nauticus"],
        ["ai-1", "AI 1"],
        ["ai-6", "AI 6"]
      ]),
      leaderboard: {
        ...emptyLeaderboard,
        // Only ai-1 has real activity (settled tiles/income/tech); ai-6 is a
        // phantom roster entry that never became active this season.
        overall: [{ id: "ai-1", name: "AI 1", rank: 1, score: 10, tiles: 5, incomePerMinute: 3, techs: 1 }]
      },
      incomingAllianceRequests: [],
      outgoingAllianceRequests: [],
      incomingTruceRequests: [],
      outgoingTruceRequests: [],
      activeTruces: []
    });

    expect(names).toEqual(["AI 1"]);
  });

  it("never excludes real human players even if they have no leaderboard activity yet", () => {
    const names = allianceTargetSuggestions({
      me: "me",
      meName: "Valen",
      playerNames: new Map([
        ["me", "Valen"],
        ["player-2", "Freshly Joined"]
      ]),
      leaderboard: emptyLeaderboard,
      incomingAllianceRequests: [],
      outgoingAllianceRequests: [],
      incomingTruceRequests: [],
      outgoingTruceRequests: [],
      activeTruces: []
    });

    expect(names).toEqual(["Freshly Joined"]);
  });
});

describe("shouldRewriteAllianceTargetOptions", () => {
  it("is true the first time (no signature stored) and false once the same signature is recorded", () => {
    const datalistEl: Pick<HTMLDataListElement, "dataset"> = { dataset: {} as DOMStringMap };
    expect(shouldRewriteAllianceTargetOptions(datalistEl, "Aurora\u0000Vanguard")).toBe(true);
    datalistEl.dataset.allianceTargetsSig = "Aurora\u0000Vanguard";
    expect(shouldRewriteAllianceTargetOptions(datalistEl, "Aurora\u0000Vanguard")).toBe(false);
    expect(shouldRewriteAllianceTargetOptions(datalistEl, "Aurora\u0000Vanguard\u0000Valen")).toBe(true);
  });
});

describe("renderAllianceTargetOptionsIfChanged", () => {
  const baseState = {
    me: "me",
    meName: "Valen",
    incomingAllianceRequests: [],
    outgoingAllianceRequests: [],
    incomingTruceRequests: [],
    outgoingTruceRequests: [],
    activeTruces: []
  };

  it("only rewrites the datalist's innerHTML when the suggestion list actually changes", () => {
    let writeCount = 0;
    let currentHtml = "";
    const dataset: DOMStringMap = {} as DOMStringMap;
    const datalistEl = {
      dataset,
      get innerHTML() {
        return currentHtml;
      },
      set innerHTML(value: string) {
        writeCount += 1;
        currentHtml = value;
      }
    } as unknown as HTMLDataListElement;

    const stateWithOnePlayer = {
      ...baseState,
      playerNames: new Map([["p-1", "Vanguard"]]),
      leaderboard: emptyLeaderboard
    };

    renderAllianceTargetOptionsIfChanged(datalistEl, stateWithOnePlayer);
    expect(writeCount).toBe(1);
    expect(currentHtml).toContain('<option value="Vanguard"></option>');

    // Re-rendering with an identical suggestion list (e.g. an unrelated HUD
    // tick) must not touch innerHTML again, or an open <input list=...>
    // autocomplete popup would flicker/close.
    renderAllianceTargetOptionsIfChanged(datalistEl, stateWithOnePlayer);
    expect(writeCount).toBe(1);

    const stateWithTwoPlayers = {
      ...baseState,
      playerNames: new Map([
        ["p-1", "Vanguard"],
        ["p-2", "Aurora"]
      ]),
      leaderboard: emptyLeaderboard
    };

    renderAllianceTargetOptionsIfChanged(datalistEl, stateWithTwoPlayers);
    expect(writeCount).toBe(2);
    expect(currentHtml).toContain('<option value="Aurora"></option>');
  });
});
