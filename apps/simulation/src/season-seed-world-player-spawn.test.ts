import { afterEach, describe, expect, it, vi } from "vitest";
import type { FairSpawnSite, TownDefinition } from "@border-empires/game-domain";
import type { Tile, TileKey } from "@border-empires/shared";
import { createSeasonSeedPlayerSpawner } from "./season-seed-world-player-spawn.js";

const roster = vi.hoisted(() => ({ sites: [] as FairSpawnSite[] }));
vi.mock("@border-empires/game-domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@border-empires/game-domain")>()),
  computeFairSpawnSites: () => roster.sites
}));

const key = (x: number, y: number): TileKey => `${x},${y}`;

const createSpawner = (width: number): ReturnType<typeof createSeasonSeedPlayerSpawner> => {
  const ownership = new Map<TileKey, string>();
  const townsByTile = new Map<TileKey, TownDefinition>();
  return createSeasonSeedPlayerSpawner({
    WORLD_WIDTH: width,
    WORLD_HEIGHT: 1,
    worldSeed: 1,
    terrainAt: (): Tile["terrain"] => "LAND",
    isSpawnableLand: (_x, y) => y === 0,
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
};

describe("createSeasonSeedPlayerSpawner", () => {
  afterEach(() => {
    roster.sites = [];
  });

  it("uses an unoccupied spawnable tile when separation tiers are exhausted", () => {
    const spawner = createSpawner(2);

    spawner.spawnPlayerAt("ai-1", true, 0);
    spawner.spawnPlayerAt("ai-2", true, 1);

    expect(spawner.spawnPositions).toEqual([
      { playerId: "ai-1", x: 0, y: 0, isAi: true },
      { playerId: "ai-2", x: 1, y: 0, isAi: true }
    ]);
  });

  it("places AI empires on the same pre-picked roster as players, farthest from earlier starts", () => {
    roster.sites = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 20, y: 0 }];
    const spawner = createSpawner(40);

    spawner.spawnPlayerAt("player-1", false, 0);
    spawner.spawnPlayerAt("ai-1", true, 1);

    expect(spawner.spawnPositions).toEqual([
      { playerId: "player-1", x: 0, y: 0, isAi: false },
      { playerId: "ai-1", x: 20, y: 0, isAi: true }
    ]);
  });
});
