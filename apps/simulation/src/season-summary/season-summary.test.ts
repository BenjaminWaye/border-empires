import { describe, expect, it } from "vitest";

import type { CurrentSeasonSummary, SimulationSeasonState } from "@border-empires/sim-protocol";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import { buildArchiveRow, buildCurrentSeasonSummary } from "./season-summary.js";

describe("buildCurrentSeasonSummary", () => {
  it("counts seeded ai empires as competitive players while excluding barbarians", () => {
    const runtimeState = {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", townType: "MARKET", townName: "BlackFang" },
        { x: 50, y: 50, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", townType: "MARKET", townName: "Raid Camp" }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 76,
          incomePerMinute: 2.4,
          settledTileCount: 1,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
        },
        {
          id: "ai-1",
          name: "BlackFang",
          points: 100,
          incomePerMinute: 0.6,
          settledTileCount: 1,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
        },
        {
          id: "barbarian-1",
          name: "Barbarians",
          points: 100,
          incomePerMinute: 0.6,
          settledTileCount: 1,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;
    const seasonState: SimulationSeasonState = {
      seasonId: "season-2",
      seasonSequence: 2,
      rulesetId: "seasonal-default",
      worldSeed: 123,
      status: "active",
      startedAt: 2_000,
      victoryTrackers: []
    };

    const summary = buildCurrentSeasonSummary({
      seasonState,
      runtimeState,
      onlinePlayers: 0,
      updatedAt: 2_500
    });

    expect(summary.totalPlayers).toBe(2);
    expect(summary.overall.map((entry) => entry.id)).toEqual(expect.arrayContaining(["player-1", "ai-1"]));
    expect(summary.townCount).toBe(3);
  });

  it("reuses a caller-provided worldStatus instead of re-scanning runtimeState", () => {
    // Regression for a redundant O(n_tiles) season-victory scan: callers that
    // already ran buildWorldStatusSnapshot (e.g. recomputeAndPersistCurrentSummary)
    // must be able to pass the result through instead of paying for a second scan.
    const seasonState: SimulationSeasonState = {
      seasonId: "season-3",
      seasonSequence: 3,
      rulesetId: "seasonal-default",
      worldSeed: 456,
      status: "active",
      startedAt: 1_000,
      victoryTrackers: []
    };
    const providedRuntimeState = {
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" }
      ],
      players: [
        { id: "player-1", name: "Nauticus", points: 1, incomePerMinute: 1, settledTileCount: 1, techIds: [], allies: [], vision: 1, visionRadiusBonus: 0 }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;
    const worldStatus = buildWorldStatusSnapshot("player-1", providedRuntimeState);

    // Pass an empty runtimeState alongside the pre-built worldStatus: if the
    // function ignored worldStatus and re-scanned, totalPlayers/townCount would
    // come out as 0 instead of matching the provided snapshot.
    const emptyRuntimeState = {
      tiles: [],
      players: [],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const summary = buildCurrentSeasonSummary({
      seasonState,
      runtimeState: emptyRuntimeState,
      onlinePlayers: 0,
      updatedAt: 1_500,
      worldStatus
    });

    expect(summary.overall.map((entry) => entry.id)).toEqual(["player-1"]);
    expect(summary.seasonVictory).toBe(worldStatus.seasonVictory);
  });
});

describe("buildArchiveRow", () => {
  it("carries seasonStats (deadliest tile / longest road) into the archived row", () => {
    // Regression: buildArchiveRow mapped winner/galaxyTiers/defenseCampaignTargetSeasonId
    // field-by-field but never referenced summary.seasonStats, so every archived
    // season_archive row silently dropped mostDeadlyTile/longestRoad even though
    // the live CurrentSeasonSummary (and world_status_current) had them set
    // correctly -- confirmed against prod data for a real ended season.
    const summary: CurrentSeasonSummary = {
      season: "season-8",
      seasonId: "season-8",
      seasonSequence: 8,
      status: "ended",
      startedAt: 1_000,
      endedAt: 50_000,
      worldSeed: 1,
      rulesetId: "seasonal-default",
      seasonStats: {
        mostDeadlyTile: { x: 387, y: 423, manpowerLost: 42128 },
        longestRoad: { tileCount: 39 }
      },
      leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] } as CurrentSeasonSummary["leaderboard"],
      overall: [],
      byTiles: [],
      byIncome: [],
      byTechs: [],
      seasonVictory: [],
      onlinePlayers: 0,
      totalPlayers: 0,
      townCount: 0,
      updatedAt: 50_000
    };

    const archiveRow = buildArchiveRow(summary);

    expect(archiveRow.seasonStats).toEqual({
      mostDeadlyTile: { x: 387, y: 423, manpowerLost: 42128 },
      longestRoad: { tileCount: 39 }
    });

    // Round-trip through JSON the way SqliteSeasonSummaryStore persists it,
    // to catch the field being dropped by serialization rather than mapping.
    const roundTripped = JSON.parse(JSON.stringify(archiveRow));
    expect(roundTripped.seasonStats).toEqual(summary.seasonStats);
  });

  it("omits seasonStats when the live summary has none", () => {
    const summary: CurrentSeasonSummary = {
      season: "season-9",
      seasonId: "season-9",
      seasonSequence: 9,
      status: "ended",
      startedAt: 1_000,
      endedAt: 50_000,
      worldSeed: 1,
      rulesetId: "seasonal-default",
      leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] } as CurrentSeasonSummary["leaderboard"],
      overall: [],
      byTiles: [],
      byIncome: [],
      byTechs: [],
      seasonVictory: [],
      onlinePlayers: 0,
      totalPlayers: 0,
      townCount: 0,
      updatedAt: 50_000
    };

    const archiveRow = buildArchiveRow(summary);

    expect(archiveRow.seasonStats).toBeUndefined();
  });
});
