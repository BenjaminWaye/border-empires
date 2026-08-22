import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveSnapshot, SeasonWinnerSnapshot } from "@border-empires/sim-protocol";

import { computeSeasonGalaxyTiers, galaxyTiersAtCrowning } from "./season-galaxy-tiers.js";

const baseObjective = (overrides: Partial<SeasonVictoryObjectiveSnapshot> & { id: SeasonVictoryObjectiveSnapshot["id"] }): SeasonVictoryObjectiveSnapshot => ({
  name: overrides.id,
  description: "",
  leaderName: "Someone",
  progressLabel: "",
  thresholdLabel: "",
  holdDurationSeconds: 0,
  statusLabel: "",
  conditionMet: false,
  ...overrides
});

const winner: SeasonWinnerSnapshot = {
  playerId: "player-1",
  playerName: "Winner",
  crownedAt: 0,
  objectiveId: "TOWN_CONTROL",
  objectiveName: "Town Control"
};

describe("computeSeasonGalaxyTiers", () => {
  it("gives an Outpost to a non-winner leading a different path at/above the threshold, specialized by THEIR path", () => {
    const objectives = [
      baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 }),
      baseObjective({ id: "RESOURCE_MONOPOLY", leaderPlayerId: "player-2", progress: 0.6 })
    ];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1", "player-2"]),
      playerNamesById: new Map([["player-1", "Winner"], ["player-2", "Runner Up"]]),
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([{ playerId: "player-2", playerName: "Runner Up", tier: "OUTPOST", specialization: "EXTRACTION" }]);
  });

  it("does not grant an Outpost for leading a different path below the threshold, falls through to Stipend instead", () => {
    const objectives = [
      baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 }),
      baseObjective({ id: "RESOURCE_MONOPOLY", leaderPlayerId: "player-2", progress: 0.4 })
    ];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1", "player-2"]),
      playerNamesById: new Map([["player-2", "Runner Up"]]),
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([{ playerId: "player-2", playerName: "Runner Up", tier: "STIPEND", influence: 4, production: 16 }]);
  });

  it("does not grant an Outpost for leading the SAME path the winner won (that's the winner's own crown)", () => {
    const objectives = [baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 })];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1"]),
      playerNamesById: new Map(),
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([]);
  });

  it("gives a Stipend scaled to the player's own best-path progress fraction (§13 formula)", () => {
    const objectives = [
      baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 }),
      baseObjective({ id: "MARITIME_SUPREMACY", leaderPlayerId: "player-3", progress: 0.2 })
    ];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1", "player-2"]),
      playerNamesById: new Map([["player-2", "Bystander"]]),
      selfProgressByPlayerId: new Map([["player-2", new Map([["MARITIME_SUPREMACY", 0.9]])]])
    });
    expect(records).toEqual([{ playerId: "player-2", playerName: "Bystander", tier: "STIPEND", influence: 9, production: 36 }]);
  });

  it("gives no record at all to a player with zero progress on every path", () => {
    const objectives = [baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 })];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1", "player-2"]),
      playerNamesById: new Map([["player-2", "Ghost"]]),
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([]);
  });

  it("skips the crowned winner themselves", () => {
    const objectives = [baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 })];
    const records = computeSeasonGalaxyTiers({
      objectives,
      crownedWinner: winner,
      competitivePlayerIds: new Set(["player-1"]),
      playerNamesById: new Map([["player-1", "Winner"]]),
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([]);
  });
});

describe("galaxyTiersAtCrowning", () => {
  it("adapts a leaderboard overall array + self-progress map into computeSeasonGalaxyTiers' inputs", () => {
    const objectives = [
      baseObjective({ id: "TOWN_CONTROL", leaderPlayerId: "player-1", progress: 1 }),
      baseObjective({ id: "RESOURCE_MONOPOLY", leaderPlayerId: "player-2", progress: 0.7 })
    ];
    const records = galaxyTiersAtCrowning({
      objectives,
      crownedWinner: winner,
      overall: [{ id: "player-1", name: "Winner" }, { id: "player-2", name: "Runner Up" }],
      selfProgressByPlayerId: new Map()
    });
    expect(records).toEqual([{ playerId: "player-2", playerName: "Runner Up", tier: "OUTPOST", specialization: "EXTRACTION" }]);
  });
});
