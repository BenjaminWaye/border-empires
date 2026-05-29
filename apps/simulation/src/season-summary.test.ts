import { describe, expect, it } from "vitest";

import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import type { SimulationRuntime } from "./runtime.js";
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
});