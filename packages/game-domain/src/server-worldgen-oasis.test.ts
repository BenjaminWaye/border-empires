import { describe, expect, it } from "vitest";
import type { LandBiome, Tile, TileKey } from "@border-empires/shared";

import { key } from "./server-game-constants/server-game-constants.js";
import { createServerWorldgenOasis } from "./server-worldgen-oasis.js";
import type { ClusterDefinition } from "./server-shared-types.js";

const WORLD_WIDTH = 30;
const WORLD_HEIGHT = 30;

/** All-LAND, all-SAND 30x30 synthetic desert so the oasis carve-out has room to place. */
const buildDeps = () => {
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const terrainOverrides = new Map<TileKey, Tile["terrain"]>();
  const biomeOverrides = new Map<TileKey, LandBiome>();
  return {
    seeded01: (a: number, b: number, seed: number): number => {
      const n = Math.sin((a * 12.9898 + b * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
      return n - Math.floor(n);
    },
    WORLD_WIDTH,
    WORLD_HEIGHT,
    wrapX: (x: number, width: number): number => ((x % width) + width) % width,
    wrapY: (y: number, height: number): number => ((y % height) + height) % height,
    terrainAt: (x: number, y: number): Tile["terrain"] => terrainOverrides.get(key(x, y)) ?? "LAND",
    overrideTerrainAt: (x: number, y: number, terrain: Tile["terrain"]): void => {
      terrainOverrides.set(key(x, y), terrain);
    },
    landBiomeAt: (x: number, y: number): LandBiome => biomeOverrides.get(key(x, y)) ?? "SAND",
    overrideLandBiomeAt: (x: number, y: number, biome: LandBiome): void => {
      biomeOverrides.set(key(x, y), biome);
    },
    key,
    clusterByTile,
    clustersById,
    terrainOverrides,
    biomeOverrides
  };
};

describe("generateOases", () => {
  it("carves a water pond ringed by GRASS+FARM in a desert block with no food", () => {
    const deps = buildDeps();

    createServerWorldgenOasis(deps).generateOases(11);

    const pondTiles = [...deps.terrainOverrides.entries()].filter(([, terrain]) => terrain === "SEA");
    expect(pondTiles.length).toBeGreaterThan(0);

    const farmClusters = [...deps.clustersById.values()].filter((cluster) => cluster.resourceType === "FARM" && cluster.radius > 1);
    expect(farmClusters.length).toBeGreaterThan(0);

    // Every FARM tile placed by the oasis should have been biome-overridden to GRASS.
    for (const [tileKey, clusterId] of deps.clusterByTile.entries()) {
      if (!clusterId.startsWith("cl-oasis-")) continue;
      expect(deps.biomeOverrides.get(tileKey)).toBe("GRASS");
    }
  });

  it("does not carve an oasis in a block that already has real food", () => {
    const deps = buildDeps();
    const clusterId = "cl-real";
    deps.clustersById.set(clusterId, { clusterId, clusterType: "FERTILE_PLAINS", resourceType: "FARM", centerX: 5, centerY: 5, radius: 3, controlThreshold: 3 });
    for (let dx = 0; dx < 6; dx += 1) deps.clusterByTile.set(key(5 + dx, 5), clusterId);

    createServerWorldgenOasis(deps).generateOases(11);

    const pondTiles = [...deps.terrainOverrides.entries()].filter(([, terrain]) => terrain === "SEA");
    expect(pondTiles).toHaveLength(0);
  });
});
