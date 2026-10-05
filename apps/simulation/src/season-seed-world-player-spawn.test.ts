import { describe, expect, it } from "vitest";
import type { TownDefinition } from "@border-empires/game-domain";
import type { Tile, TileKey } from "@border-empires/shared";
import { createSeasonSeedPlayerSpawner } from "./season-seed-world-player-spawn.js";

const key = (x: number, y: number): TileKey => `${x},${y}`;

describe("createSeasonSeedPlayerSpawner", () => {
  it("uses an unoccupied spawnable tile when separation tiers are exhausted", () => {
    const ownership = new Map<TileKey, string>();
    const townsByTile = new Map<TileKey, TownDefinition>();
    const spawner = createSeasonSeedPlayerSpawner({
      WORLD_WIDTH: 2,
      WORLD_HEIGHT: 1,
      worldSeed: 1,
      terrainAt: (): Tile["terrain"] => "LAND",
      isSpawnableLand: (x, y) => y === 0 && (x === 0 || x === 1),
      wrapX: (value, size) => ((value % size) + size) % size,
      wrapY: (value, size) => ((value % size) + size) % size,
      key,
      chebyshevDistance: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
      seeded01: () => 0,
      townsByTile,
      docksByTile: new Map(),
      ownership,
      clusterByTile: new Map(),
      clustersById: new Map(),
      shardSitesByTile: new Map(),
      watchtowersByTile: new Map(),
      waystationsByTile: new Map(),
      naturalWondersByTile: new Map(),
      createSettlementTown: (tileKeyValue, type): TownDefinition => ({
        townId: `town-${tileKeyValue}`,
        tileKey: tileKeyValue,
        type,
        population: 800,
        maxPopulation: 10_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        lastGrowthTickAt: 0,
        isSettlement: true
      }),
      townTypeAt: () => "MARKET",
      minTownSpacing: () => 1
    });

    spawner.spawnPlayerAt("ai-1", true, 0);
    spawner.spawnPlayerAt("ai-2", true, 1);

    expect(spawner.spawnPositions).toEqual([
      { playerId: "ai-1", x: 0, y: 0, isAi: true },
      { playerId: "ai-2", x: 1, y: 0, isAi: true }
    ]);
  });
});
