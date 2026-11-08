import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SimulationSeasonState } from "@border-empires/sim-protocol";
import { buildSnapshotBuildOptions } from "./snapshot-build-options.js";

const season: SimulationSeasonState = {
  seasonId: "ended",
  seasonSequence: 1,
  rulesetId: "seasonal-default",
  worldSeed: 1,
  status: "ended",
  startedAt: 1,
  victoryTrackers: [],
  winner: {
    playerId: "p", playerName: "Old", crownedAt: 2,
    objectiveId: "TOWN_CONTROL", objectiveName: "Town Control"
  }
};
const summary: Pick<CurrentSeasonSummary, "seasonId" | "seasonStats" | "scoreHistory"> = {
  seasonId: "ended",
  seasonStats: { longestRoad: { tileCount: 42 }, mostDeadlyTile: { x: 1, y: 2, manpowerLost: 500 } },
  scoreHistory: [{ playerId: "p", playerName: "Current", points: [{ t: 1, score: 2 }, { t: 2, score: 5 }] }]
};
const build = (currentSummary = summary, currentSeasonState = season) => buildSnapshotBuildOptions({
  useFullVisibility: true,
  needsFullWorldExport: true,
  respawnNotice: undefined,
  currentSeasonState,
  currentSummary,
  nonCompetitivePlayerIds: undefined,
  fullVisibilityTiles: undefined,
  worldStatusSnapshot: undefined
});

describe("season records on login", () => {
  it("recovers existing summary records for winners crowned before records were stored on the winner", () => {
    expect(build().seasonState?.winner?.seasonStats).toEqual(summary.seasonStats);
    expect(build().seasonState?.winner?.scoreHistory).toEqual(summary.scoreHistory);
    expect(season.winner?.seasonStats).toBeUndefined();
  });

  it("never takes statistics from a different season", () => {
    expect(build({ ...summary, seasonId: "previous" }).seasonState?.winner?.seasonStats).toBeUndefined();
  });

  it("preserves the captured crowning records over a later summary", () => {
    const crownedStats = { longestRoad: { tileCount: 12 } };
    const crownedSeason = { ...season, winner: { ...season.winner!, seasonStats: crownedStats, scoreHistory: [] } };
    expect(build(summary, crownedSeason).seasonState?.winner?.seasonStats).toEqual(crownedStats);
    expect(build(summary, crownedSeason).seasonState?.winner?.scoreHistory).toEqual([]);
  });
});
