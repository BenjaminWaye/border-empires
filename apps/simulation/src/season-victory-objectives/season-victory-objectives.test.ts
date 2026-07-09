import { describe, expect, it } from "vitest";

import { computeSeasonVictory, mergeSelfProgress } from "./season-victory-objectives.js";

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
