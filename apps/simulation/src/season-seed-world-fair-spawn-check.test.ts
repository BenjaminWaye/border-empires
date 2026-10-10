import { describe, expect, it } from "vitest";
import type { Tile, TileKey } from "@border-empires/shared";
import type { ClusterDefinition } from "@border-empires/game-domain";
import { countFairSpawnSitesForWorldgenCheck, FAIR_SPAWN_SITE_WORLDGEN_MINIMUM } from "./season-seed-world-fair-spawn-check.js";

const key = (x: number, y: number): TileKey => `${x},${y}` as TileKey;

describe("countFairSpawnSitesForWorldgenCheck", () => {
  it("counts up to the worldgen minimum on a map dense with towns and food", () => {
    const size = 140;
    const clusterByTile = new Map<TileKey, string>();
    const clustersById = new Map<string, ClusterDefinition>();
    const townsByTile = new Map<TileKey, unknown>();
    for (let y = 5; y < size; y += 10) {
      for (let x = 5; x < size; x += 10) {
        townsByTile.set(key(x, y), {});
        const clusterId = `cluster-${x}-${y}`;
        for (let dx = 1; dx <= 4; dx += 1) clusterByTile.set(key(x + dx, y), clusterId);
        clustersById.set(clusterId, { resourceType: "FARM" } as ClusterDefinition);
      }
    }
    const terrainAt = (): Tile["terrain"] => "LAND";

    const count = countFairSpawnSitesForWorldgenCheck({
      WORLD_WIDTH: size,
      WORLD_HEIGHT: size,
      terrainAt,
      key,
      clusterByTile,
      clustersById,
      townsByTile
    });

    expect(count).toBe(FAIR_SPAWN_SITE_WORLDGEN_MINIMUM);
  });

  it("rejects a map with abundant open land but no opening economy", () => {
    const size = 20; // 400 open LAND tiles, no towns or resources anywhere
    const terrainAt = (): Tile["terrain"] => "LAND";

    const count = countFairSpawnSitesForWorldgenCheck({
      WORLD_WIDTH: size,
      WORLD_HEIGHT: size,
      terrainAt,
      key,
      clusterByTile: new Map(),
      clustersById: new Map(),
      townsByTile: new Map()
    });

    expect(count).toBe(0);
  });

  it("returns 0 when the map has no land at all", () => {
    const size = 20;
    const terrainAt = (): Tile["terrain"] => "SEA";

    const count = countFairSpawnSitesForWorldgenCheck({
      WORLD_WIDTH: size,
      WORLD_HEIGHT: size,
      terrainAt,
      key,
      clusterByTile: new Map(),
      clustersById: new Map(),
      townsByTile: new Map()
    });

    expect(count).toBe(0);
  });
});
