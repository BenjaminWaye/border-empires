import { describe, expect, it } from "vitest";

import { measurePlayerSubscriptionSnapshot, summarizePlayerSubscriptionSnapshotCache } from "./snapshot-diagnostics.js";

describe("snapshot diagnostics", () => {
  it("measures snapshot byte sections", () => {
    const snapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 5,
        manpower: 2,
        manpowerCap: 10,
        incomePerMinute: 1,
        strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
        developmentProcessLimit: 1,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: []
      },
      worldStatus: {
        leaderboard: {
          overall: [],
          byTiles: [],
          byIncome: [],
          byTechs: []
        },
        seasonVictory: []
      },
      season: {
        seasonId: "season-1",
        seasonSequence: 1,
        rulesetId: "default",
        worldSeed: 7,
        status: "active",
        startedAt: 1,
        victoryTrackers: []
      },
      docks: [{ dockId: "dock-1", tileKey: "1,1", pairedDockId: "dock-2" }],
      tiles: [{ x: 1, y: 1, terrain: "LAND", ownerId: "player-1" as const }]
    };

    const measure = measurePlayerSubscriptionSnapshot(snapshot);
    expect(measure.tileCount).toBe(1);
    expect(measure.docksCount).toBe(1);
    expect(measure.snapshotJsonBytes).toBeGreaterThan(measure.tilesJsonBytes);
    expect(measure.playerJsonBytes).toBeGreaterThan(0);
    expect(measure.worldStatusJsonBytes).toBeGreaterThan(0);
    expect(measure.seasonJsonBytes).toBeGreaterThan(0);
    expect(measure.docksJsonBytes).toBeGreaterThan(0);
  });

  it("summarizes cache bytes and top entries", () => {
    const summary = summarizePlayerSubscriptionSnapshotCache([
      ["player-1", { playerId: "player-1", tiles: [{ x: 1, y: 1, terrain: "LAND" as const }] }],
      [
        "player-2",
        {
          playerId: "player-2",
          tiles: [
            { x: 1, y: 1, terrain: "LAND" as const },
            { x: 2, y: 1, terrain: "LAND" as const }
          ]
        }
      ]
    ]);

    expect(summary.entryCount).toBe(2);
    expect(summary.totalSnapshotJsonBytes).toBeGreaterThan(0);
    expect(summary.topEntries[0]?.playerId).toBe("player-2");
  });

  it("deduplicates shared tile arrays when summarizing cache bytes", () => {
    const sharedTiles = [{ x: 1, y: 1, terrain: "LAND" as const }];
    const summary = summarizePlayerSubscriptionSnapshotCache([
      ["player-1", { playerId: "player-1", tiles: sharedTiles }],
      ["player-2", { playerId: "player-2", tiles: sharedTiles }]
    ]);

    expect(summary.entryCount).toBe(2);
    expect(summary.uniqueTileArrayCount).toBe(1);
    expect(summary.uniqueTilesJsonBytes).toBeGreaterThan(0);
    expect(summary.totalSnapshotJsonBytes).toBeLessThan(
      JSON.stringify({ playerId: "player-1", tiles: sharedTiles }).length +
        JSON.stringify({ playerId: "player-2", tiles: sharedTiles }).length
    );
  });
});
