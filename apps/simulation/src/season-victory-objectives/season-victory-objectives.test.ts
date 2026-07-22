import { describe, expect, it } from "vitest";

import {
  buildEconomicHegemonyObjective,
  computeSeasonVictory,
  economicHegemonySelfProgressLabel,
  mergeSelfProgress,
  seasonVictoryForBroadcast
} from "./season-victory-objectives.js";

type WorldTileFixture = Parameters<typeof computeSeasonVictory>[0][number];
type LeaderboardFixture = Parameters<typeof computeSeasonVictory>[1];
type PlayersFixture = Parameters<typeof computeSeasonVictory>[2];

describe("computeSeasonVictory", () => {
  it("computes a self-progress label for every non-leading competitive player from one scan", () => {
    // Regression for the bug where performGlobalStatusBroadcast always passed an
    // empty playerObjectives array, so no player (leader or not) ever received a
    // selfProgressLabel and the client's "You: ..." comparison line never rendered.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 10, techs: 0, score: 10, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 4, techs: 0, score: 4, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const { objectives, selfProgressLabelsByPlayerId } = computeSeasonVictory(worldTiles, leaderboardOverall, players);

    const economicHegemony = objectives.find((objective) => objective.id === "ECONOMIC_HEGEMONY");
    expect(economicHegemony?.leaderPlayerId).toBe("player-1");

    const runnerUpLabels = selfProgressLabelsByPlayerId.get("player-2");
    expect(runnerUpLabels?.get("ECONOMIC_HEGEMONY")).toBe("4.0 gold/m");

    // The objective's leader never gets their own comparison line — the client
    // already renders "Leader: You" for that case.
    expect(selfProgressLabelsByPlayerId.get("player-1")?.has("ECONOMIC_HEGEMONY")).toBe(false);
  });
});

describe("buildEconomicHegemonyObjective", () => {
  it("derives the same ECONOMIC_HEGEMONY objective as computeSeasonVictory from just the leaderboard", () => {
    // Regression for the leaderboard-panel bug where the "Overall" income column
    // (refreshed every broadcast tick from the live leaderboard) and the Economic
    // Hegemony pressure card (only refreshed on the ~5-min recomputeAndPersistCurrentSummary
    // cadence) showed different gold/minute numbers for the same player. The fix makes
    // buildEconomicHegemonyObjective the single source of truth, called both by the full
    // computeSeasonVictory() pass and directly from the live leaderboard on every broadcast
    // tick (see simulation-service.ts performGlobalStatusBroadcast) — so they never drift.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const live = buildEconomicHegemonyObjective(leaderboardOverall);
    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const fromFullScan = objectives.find((objective) => objective.id === "ECONOMIC_HEGEMONY");

    expect(live).toEqual(fromFullScan);
    expect(live.progressLabel).toBe("265.0 gold/m vs 100.0");
    expect(live.leaderPlayerId).toBe("player-1");
  });

  it("self-progress label always matches the same format as the objective's progressLabel", () => {
    expect(economicHegemonySelfProgressLabel(100)).toBe("100.0 gold/m");
    expect(economicHegemonySelfProgressLabel(0)).toBe("0.0 gold/m");
  });
});

describe("seasonVictoryForBroadcast", () => {
  const cachedObjectives = [
    {
      id: "ECONOMIC_HEGEMONY" as const,
      name: "Economic Ascendancy",
      description: "Lead the world economy.",
      leaderName: "Stale Leader",
      progressLabel: "200.0 gold/m vs 50.0",
      thresholdLabel: "Need at least 200 gold/m and 33% lead",
      holdDurationSeconds: 21600,
      statusLabel: "Pressure building",
      conditionMet: false,
      leaderPlayerId: "player-1"
    },
    {
      id: "TOWN_CONTROL" as const,
      name: "Town Control",
      description: "Control 50% of all towns.",
      leaderName: "Someone",
      progressLabel: "3/10 towns",
      thresholdLabel: "Need 10 towns",
      holdDurationSeconds: 21600,
      statusLabel: "Pressure building",
      conditionMet: false
    }
  ];

  it("replaces the stale cached ECONOMIC_HEGEMONY objective with the live one and leaves other objectives untouched", () => {
    // Regression for the leaderboard-panel bug: the cached objective (from the ~5-min
    // recompute) said 200, the live leaderboard says 265 — the broadcast payload must
    // reflect 265, matching the "Overall" income column exactly.
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const liveEconomicHegemony = buildEconomicHegemonyObjective(leaderboardOverall);

    const result = seasonVictoryForBroadcast(cachedObjectives, undefined, liveEconomicHegemony, "player-2", 100);

    const economic = result.find((o) => o.id === "ECONOMIC_HEGEMONY");
    expect(economic?.progressLabel).toBe("265.0 gold/m vs 100.0");
    expect(economic?.selfProgressLabel).toBe("100.0 gold/m");
    expect(result.find((o) => o.id === "TOWN_CONTROL")).toEqual(cachedObjectives[1]);
  });

  it("does not attach a self-progress label for the objective's own leader", () => {
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const liveEconomicHegemony = buildEconomicHegemonyObjective(leaderboardOverall);

    const result = seasonVictoryForBroadcast(cachedObjectives, undefined, liveEconomicHegemony, "player-1", 265);

    expect(result.find((o) => o.id === "ECONOMIC_HEGEMONY")?.selfProgressLabel).toBeUndefined();
  });
});

describe("mergeSelfProgress", () => {
  const baseObjective = {
    id: "ECONOMIC_HEGEMONY" as const,
    name: "Economic Ascendancy",
    description: "Lead the world economy.",
    leaderName: "Leader",
    progressLabel: "10.0 gold/m vs 4.0",
    thresholdLabel: "Need at least 200 gold/m and 33% lead",
    holdDurationSeconds: 21600,
    statusLabel: "Pressure building",
    conditionMet: false
  };

  it("attaches the matching label when present", () => {
    const merged = mergeSelfProgress([baseObjective], new Map([["ECONOMIC_HEGEMONY", "4.0 gold/m"]]));
    expect(merged[0]?.selfProgressLabel).toBe("4.0 gold/m");
  });

  it("returns objectives unchanged when there are no labels for this player", () => {
    expect(mergeSelfProgress([baseObjective], undefined)).toEqual([baseObjective]);
    expect(mergeSelfProgress([baseObjective], new Map())).toEqual([baseObjective]);
  });
});
