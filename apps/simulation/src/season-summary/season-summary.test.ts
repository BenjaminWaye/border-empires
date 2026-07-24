import { describe, expect, it } from "vitest";

import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { buildCurrentSeasonSummary, finalizeCurrentSeasonSummary } from "./season-summary.js";

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

describe("finalizeCurrentSeasonSummary", () => {
  // Regression: simulation-service.ts's recomputeAndPersistCurrentSummary used
  // to return a freshly-rebuilt summary as-is whenever the season-victory
  // tracker changed on that tick (e.g. the exact moment a 24h hold starts).
  // That rebuilt summary's seasonVictory came from the pre-tracker
  // buildWorldStatusSnapshot() scan (generic "Threshold met" label, no
  // holdRemainingSeconds) — discarding the tracker-computed countdown for up
  // to 24h, until the next scheduled recompute. finalizeCurrentSeasonSummary
  // must always win with the tracker's objectives, regardless of which
  // summary (rebuilt or base) it's layering onto.
  const baseObjectives = [
    {
      id: "ECONOMIC_HEGEMONY" as const,
      name: "Economic Ascendancy",
      description: "Lead the world economy by 33% while producing at least 200 gold per minute.",
      leaderPlayerId: "ai-4",
      leaderName: "Freja Sund",
      progressLabel: "200.9 gold/m vs 113.4",
      thresholdLabel: "Need at least 200 gold/m and 33% lead",
      holdDurationSeconds: 86_400,
      statusLabel: "Threshold met",
      conditionMet: true
    }
  ];
  const trackedObjectives: CurrentSeasonSummary["seasonVictory"] = [
    { ...baseObjectives[0], holdRemainingSeconds: 86_280, statusLabel: "Holding pressure" }
  ];
  const summaryStub = (seasonVictory: CurrentSeasonSummary["seasonVictory"]): CurrentSeasonSummary => ({
    season: "season-5",
    seasonId: "season-5",
    seasonSequence: 5,
    status: "active",
    startedAt: 0,
    worldSeed: 1,
    rulesetId: "seasonal-default",
    leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] },
    overall: [],
    byTiles: [],
    byIncome: [],
    byTechs: [],
    seasonVictory,
    onlinePlayers: 0,
    totalPlayers: 0,
    townCount: 0,
    updatedAt: 0
  });

  it("overrides seasonVictory with tracker objectives even when a rebuilt summary is provided", () => {
    const baseSummary = summaryStub(baseObjectives);
    // Simulates buildCurrentSeasonSummary's rebuild output — raw, pre-tracker
    // seasonVictory (no holdRemainingSeconds), same as the stale worldStatus.
    const rebuiltSummary = summaryStub(baseObjectives);

    const finalSummary = finalizeCurrentSeasonSummary(baseSummary, rebuiltSummary, trackedObjectives);

    expect(finalSummary.seasonVictory).toBe(trackedObjectives);
    expect(finalSummary.seasonVictory[0].holdRemainingSeconds).toBe(86_280);
    expect(finalSummary.seasonVictory[0].statusLabel).toBe("Holding pressure");
  });

  it("overrides seasonVictory with tracker objectives when no rebuild happened (base summary only)", () => {
    const baseSummary = summaryStub(baseObjectives);

    const finalSummary = finalizeCurrentSeasonSummary(baseSummary, undefined, trackedObjectives);

    expect(finalSummary.seasonVictory).toBe(trackedObjectives);
  });

  it("preserves the rebuilt summary's other fields (e.g. a newly-crowned winner) while still using tracker objectives", () => {
    const baseSummary = summaryStub(baseObjectives);
    const rebuiltSummary: CurrentSeasonSummary = {
      ...summaryStub(baseObjectives),
      seasonWinner: { playerId: "ai-4", playerName: "Freja Sund", crownedAt: 500, objectiveId: "ECONOMIC_HEGEMONY", objectiveName: "Economic Ascendancy" }
    };

    const finalSummary = finalizeCurrentSeasonSummary(baseSummary, rebuiltSummary, trackedObjectives);

    expect(finalSummary.seasonWinner?.playerId).toBe("ai-4");
    expect(finalSummary.seasonVictory).toBe(trackedObjectives);
  });
});
