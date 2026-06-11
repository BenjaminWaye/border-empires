import { describe, expect, it } from "vitest";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildWorldStatusSnapshot } from "./world-status-snapshot.js";

describe("buildWorldStatusSnapshot", () => {
  it("uses the rewrite leaderboard score formula and excludes barbarians from competition", () => {
    const runtimeState = {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "WOOD" },
        { x: 13, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "IRON" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", townType: "MARKET", townName: "BlackFang" },
        { x: 50, y: 50, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", townType: "MARKET", townName: "Raid Camp" }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 76,
          incomePerMinute: 2.4,
          settledTileCount: 4,
          techIds: [],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "11,10", "12,10", "13,10"]
        },
        {
          id: "ai-1",
          name: "BlackFang",
          points: 100,
          incomePerMinute: 0.6,
          settledTileCount: 1,
          techIds: [],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["30,30"]
        },
        {
          id: "barbarian-1",
          name: "Barbarians",
          points: 100,
          incomePerMinute: 0.6,
          settledTileCount: 1,
          techIds: [],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["50,50"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-1", runtimeState);

    expect(snapshot.leaderboard.overall).toEqual([
      expect.objectContaining({ id: "player-1", score: 11.2, rank: 1 }),
      expect.objectContaining({ id: "ai-1", score: 2.8, rank: 2 })
    ]);
    expect(snapshot.leaderboard.overall.find((entry) => entry.id === "barbarian-1")).toBeUndefined();
    expect(snapshot.seasonVictory.every((objective) => objective.leaderPlayerId !== "barbarian-1")).toBe(true);
  });

  it("counts neutral towns toward the town-control target", () => {
    const runtimeState = {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        { x: 20, y: 20, terrain: "LAND", townType: "MARKET", townName: "Neutral Port" }
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
          territoryTileKeys: ["10,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-1", runtimeState);
    const townControl = snapshot.seasonVictory.find((objective) => objective.id === "TOWN_CONTROL");

    expect(townControl).toEqual(expect.objectContaining({ progressLabel: "1/1 towns", thresholdLabel: "Need 1 towns" }));
  });

  it("uses configured resource and maritime thresholds for season victory status", () => {
    const tiles = Array.from({ length: 10 }, (_, x) => ({
      x,
      y: 0,
      terrain: "LAND",
      resource: "IRON",
      ...(x < 5 ? { dockId: `dock-${x}` } : {}),
      ...(x < 8 ? { ownerId: "player-1", ownershipState: "SETTLED" } : {})
    }));
    const runtimeState = {
      tiles,
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 76,
          incomePerMinute: 2.4,
          settledTileCount: 8,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: tiles.slice(0, 8).map((tile) => `${tile.x},${tile.y}`)
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-1", runtimeState);
    const resourceMonopoly = snapshot.seasonVictory.find((objective) => objective.id === "RESOURCE_MONOPOLY");
    const maritimeSupremacy = snapshot.seasonVictory.find((objective) => objective.id === "MARITIME_SUPREMACY");

    expect(resourceMonopoly).toEqual(
      expect.objectContaining({
        progressLabel: "8/10 IRON",
        thresholdLabel: "Need 80% control of one resource type",
        conditionMet: true
      })
    );
    expect(maritimeSupremacy).toEqual(
      expect.objectContaining({
        progressLabel: "5/3 docks",
        thresholdLabel: "Need 3 settled docks (55% of world docks)",
        conditionMet: true
      })
    );
  });

  it("counts alliance-bloc land for diplomatic dominance and awards the largest bloc member", () => {
    const tiles = Array.from({ length: 10 }, (_, x) => ({
      x,
      y: 0,
      terrain: "LAND",
      ownerId: x < 4 ? "player-1" : x < 7 ? "player-2" : "ai-1",
      ownershipState: x === 9 ? "FRONTIER" : "SETTLED"
    }));
    const runtimeState = {
      tiles,
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 100,
          incomePerMinute: 2,
          settledTileCount: 4,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: ["player-2"],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["0,0", "1,0", "2,0", "3,0"]
        },
        {
          id: "player-2",
          name: "Ally",
          points: 80,
          incomePerMinute: 2,
          settledTileCount: 3,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: ["player-1"],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["4,0", "5,0", "6,0"]
        },
        {
          id: "ai-1",
          name: "AI 1",
          points: 60,
          incomePerMinute: 1,
          settledTileCount: 3,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["7,0", "8,0", "9,0"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-2", runtimeState);
    const diplomaticDominance = snapshot.seasonVictory.find((objective) => objective.id === "DIPLOMATIC_DOMINANCE");

    expect(diplomaticDominance).toEqual(
      expect.objectContaining({
        leaderPlayerId: "player-1",
        leaderName: "Nauticus",
        progressLabel: "7/7 alliance-controlled land · leader 4 tiles · 2 members",
        selfProgressLabel: "7/7 alliance-controlled land",
        conditionMet: true
      })
    );
  });

  it("uses Nauticus as the fallback seeded human display name", () => {
    const runtimeState = {
      tiles: [],
      players: [
        {
          id: "player-1",
          name: "player-1",
          points: 100,
          incomePerMinute: 1,
          settledTileCount: 1,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: []
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-1", runtimeState);

    expect(snapshot.leaderboard.overall[0]?.name).toBe("Nauticus");
  });

  it("anonymizes opaque human auth ids in leaderboard output", () => {
    const runtimeState = {
      tiles: [],
      players: [
        {
          id: "orz1OiQwxGS5LKwcAwG5wzNCd3P2",
          name: "orz1OiQwxGS5LKwcAwG5wzNCd3P2",
          points: 100,
          incomePerMinute: 1,
          settledTileCount: 1,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: []
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("orz1OiQwxGS5LKwcAwG5wzNCd3P2", runtimeState);

    expect(snapshot.leaderboard.overall[0]?.name).toMatch(/^Empire [0-9A-Z]{6}$/);
    expect(snapshot.leaderboard.overall[0]?.name).not.toBe("orz1OiQwxGS5LKwcAwG5wzNCd3P2");
  });

  it("excludes players listed in nonCompetitivePlayerIds from all leaderboard arrays", () => {
    const runtimeState = {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 20, y: 20, terrain: "LAND", ownerId: "probe-1", ownershipState: "SETTLED" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 100,
          incomePerMinute: 5,
          settledTileCount: 1,
          techIds: ["tech-1"],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        },
        {
          id: "probe-1",
          name: "Probe Player",
          points: 500,
          incomePerMinute: 20,
          settledTileCount: 1,
          techIds: ["tech-1", "tech-2", "tech-3"],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["20,20"]
        },
        {
          id: "ai-1",
          name: "AI Player",
          points: 50,
          incomePerMinute: 2,
          settledTileCount: 1,
          techIds: [],
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["30,30"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    } as ReturnType<SimulationRuntime["exportState"]>;

    const snapshot = buildWorldStatusSnapshot("player-1", runtimeState, undefined, {
      nonCompetitivePlayerIds: new Set(["probe-1"])
    });

    const ids = snapshot.leaderboard.overall.map((entry) => entry.id);
    expect(ids).not.toContain("probe-1");
    expect(ids).toContain("player-1");
    expect(ids).toContain("ai-1");

    const byTilesIds = snapshot.leaderboard.byTiles.map((entry) => entry.id);
    expect(byTilesIds).not.toContain("probe-1");

    const byIncomeIds = snapshot.leaderboard.byIncome.map((entry) => entry.id);
    expect(byIncomeIds).not.toContain("probe-1");

    const byTechsIds = snapshot.leaderboard.byTechs.map((entry) => entry.id);
    expect(byTechsIds).not.toContain("probe-1");
  });
});