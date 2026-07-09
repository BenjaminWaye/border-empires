import { describe, expect, it } from "vitest";

import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import { buildCurrentSeasonSummary } from "./season-summary.js";

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
