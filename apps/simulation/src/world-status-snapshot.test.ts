import { describe, expect, it } from "vitest";

import type { SimulationRuntime } from "./runtime.js";
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
          techIds: ["breach-doctrine"],
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
      expect.objectContaining({ id: "ai-1", score: 10.8, rank: 2 })
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
});
