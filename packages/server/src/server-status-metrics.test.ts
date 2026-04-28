import { describe, expect, it } from "vitest";

import { createServerStatusMetrics } from "./server-status-metrics.js";

describe("server status metrics", () => {
  it("excludes incomplete human profiles from leaderboard competition metrics", () => {
    const players = new Map<string, {
      id: string;
      name: string;
      isAi?: boolean;
      profileComplete?: boolean;
      territoryTiles: Set<string>;
      techIds: Set<string>;
      T: number;
    }>([
      [
        "probe-player",
        {
          id: "probe-player",
          name: "staging-probe-1777363577781-1",
          profileComplete: false,
          territoryTiles: new Set(["0,0"]),
          techIds: new Set(),
          T: 1
        }
      ],
      [
        "human-player",
        {
          id: "human-player",
          name: "Rowan Hale",
          profileComplete: true,
          territoryTiles: new Set(["1,0", "1,1", "1,2"]),
          techIds: new Set(["agriculture", "toolmaking"]),
          T: 3
        }
      ],
      [
        "ai-player",
        {
          id: "ai-player",
          name: "Sigrid Storm",
          isAi: true,
          profileComplete: true,
          territoryTiles: new Set(["2,0", "2,1"]),
          techIds: new Set(["agriculture"]),
          T: 2
        }
      ]
    ]);
    const settledByPlayer = new Map<string, { settledTileCount: number; controlledTowns: number }>([
      ["probe-player", { settledTileCount: 1, controlledTowns: 0 }],
      ["human-player", { settledTileCount: 3, controlledTowns: 1 }],
      ["ai-player", { settledTileCount: 2, controlledTowns: 1 }]
    ]);
    const incomeByPlayer = new Map<string, number>([
      ["probe-player", 0],
      ["human-player", 6],
      ["ai-player", 4]
    ]);

    const metrics = createServerStatusMetrics({
      cachedAiTerritoryStructureForPlayer: (player: { id: string }) => settledByPlayer.get(player.id) ?? { settledTileCount: 0, controlledTowns: 0 },
      currentIncomePerMinute: (player: { id: string }) => incomeByPlayer.get(player.id) ?? 0,
      frontierSettlementsByPlayer: new Map(),
      VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS: 60_000,
      now: () => 0,
      townsByTile: new Map(),
      ownership: new Map(),
      ownershipStateByTile: new Map(),
      WORLD_WIDTH: 1,
      WORLD_HEIGHT: 1,
      terrainAtRuntime: () => "LAND",
      applyClusterResources: (_x: number, _y: number, resource: undefined) => resource,
      resourceAt: () => undefined,
      players,
      parseKey: (tileKey: string) => tileKey.split(",").map(Number) as [number, number],
      activeSeason: { worldSeed: 1 },
      key: (x: number, y: number) => `${x},${y}`,
      wrapX: (x: number) => x,
      wrapY: (y: number) => y
    });

    expect(metrics.collectPlayerCompetitionMetrics()).toEqual([
      {
        playerId: "human-player",
        name: "Rowan Hale",
        tiles: 3,
        settledTiles: 3,
        incomePerMinute: 6,
        techs: 2,
        controlledTowns: 1
      },
      {
        playerId: "ai-player",
        name: "Sigrid Storm",
        tiles: 2,
        settledTiles: 2,
        incomePerMinute: 4,
        techs: 1,
        controlledTowns: 1
      }
    ]);

    const leaderboard = metrics.computeLeaderboardSnapshot(10);
    expect(leaderboard.overall.map((entry: { name: string }) => entry.name)).toEqual(["Rowan Hale", "Sigrid Storm"]);
    expect(leaderboard.byTiles.map((entry: { name: string }) => entry.name)).toEqual(["Rowan Hale", "Sigrid Storm"]);
    expect(leaderboard.byIncome.map((entry: { name: string }) => entry.name)).toEqual(["Rowan Hale", "Sigrid Storm"]);
    expect(leaderboard.byTechs.map((entry: { name: string }) => entry.name)).toEqual(["Rowan Hale", "Sigrid Storm"]);
  });
});
