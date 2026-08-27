import { describe, expect, it } from "vitest";
import type { LandBiome, ResourceType, Tile, TileKey } from "@border-empires/shared";

import { key } from "./server-game-constants/server-game-constants.js";
import { createServerWorldgenTowns } from "./server-worldgen-towns.js";
import type { ClusterDefinition } from "./server-shared-types.js";

/**
 * All-LAND 30x30 synthetic world (exactly one economy block, since
 * ensureBaselineEconomyCoverage scans in 30x30 tiles) so the food-coverage
 * fallback logic is exercised directly without needing real terrain/biome
 * gating (covered elsewhere).
 */
const WORLD_WIDTH = 30;
const WORLD_HEIGHT = 30;

const buildDeps = () => {
  const townsByTile = new Map();
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const docksByTile = new Map();
  return {
    seeded01: (a: number, b: number, seed: number): number => {
      const n = Math.sin((a * 12.9898 + b * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
      return n - Math.floor(n);
    },
    regionTypeAtLocal: (): undefined => undefined,
    landBiomeAt: (): LandBiome => "GRASS",
    activeSeason: { worldSeed: 7 },
    townsByTile,
    firstSpecialSiteCaptureClaimed: new Set<TileKey>(),
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt: (): Tile["terrain"] => "LAND",
    key,
    docksByTile,
    clusterByTile,
    POPULATION_MAX: 1000,
    POPULATION_TOWN_MIN: 10,
    now: (): number => 0,
    wrapX: (x: number, width: number): number => ((x % width) + width) % width,
    wrapY: (y: number, height: number): number => ((y % height) + height) % height,
    parseKey: (tileKey: TileKey): [number, number] => tileKey.split(",").map(Number) as [number, number],
    assignMissingTownNames: (): void => {},
    getIslandMap: () => ({ islandIdByTile: new Map<TileKey, number>() }),
    WORLD_TOWN_POPULATION_MIN: 10,
    WORLD_TOWN_POPULATION_START_SPREAD: 5,
    nearestLandTiles: (
      originX: number,
      originY: number,
      candidates: Array<{ x: number; y: number }>,
      limit: number,
      predicate?: (tile: { x: number; y: number }) => boolean
    ): TileKey[] =>
      candidates
        .filter((tile) => (predicate ? predicate(tile) : true))
        .slice(0, limit)
        .map((tile) => key(tile.x, tile.y)),
    resourcePlacementAllowed: (): boolean => true,
    clustersById,
    clusterResourceType: (cluster: ClusterDefinition): ResourceType => cluster.resourceType ?? "FARM"
  };
};

describe("ensureBaselineEconomyCoverage", () => {
  it("still seeds a real food cluster in a block whose only food is a single-tile satellite deposit", () => {
    const deps = buildDeps();
    // A lone FARM satellite (radius 1, as placed by the satellite pass in
    // server-worldgen-clusters.ts) in the first 30x30 block, with nothing
    // else nearby.
    const satelliteClusterId = "cl-satellite";
    deps.clustersById.set(satelliteClusterId, {
      clusterId: satelliteClusterId,
      clusterType: "FERTILE_PLAINS",
      resourceType: "FARM",
      centerX: 5,
      centerY: 5,
      radius: 1,
      controlThreshold: 3
    });
    deps.clusterByTile.set(key(5, 5), satelliteClusterId);

    createServerWorldgenTowns(deps).ensureBaselineEconomyCoverage(11);

    const realFoodClusters = [...deps.clustersById.values()].filter(
      (cluster) => cluster.clusterId !== satelliteClusterId && cluster.radius > 1 && (cluster.resourceType === "FARM" || cluster.resourceType === "FISH")
    );
    expect(realFoodClusters.length).toBeGreaterThan(0);
  });

  it("does not seed a redundant food cluster in a block that already has a real food cluster", () => {
    const deps = buildDeps();
    const realClusterId = "cl-real";
    deps.clustersById.set(realClusterId, {
      clusterId: realClusterId,
      clusterType: "FERTILE_PLAINS",
      resourceType: "FARM",
      centerX: 5,
      centerY: 5,
      radius: 3,
      controlThreshold: 3
    });
    for (let dx = 0; dx < 6; dx += 1) deps.clusterByTile.set(key(5 + dx, 5), realClusterId);

    createServerWorldgenTowns(deps).ensureBaselineEconomyCoverage(11);

    const foodClusters = [...deps.clustersById.values()].filter((cluster) => cluster.resourceType === "FARM" || cluster.resourceType === "FISH");
    expect(foodClusters).toHaveLength(1);
  });

  it("rejects placing a town directly adjacent to an existing town, but allows one far enough away", () => {
    const deps = buildDeps();
    const townsRuntime = createServerWorldgenTowns(deps);
    deps.townsByTile.set(key(10, 10), {
      townId: "town-seed",
      tileKey: key(10, 10),
      type: "MARKET",
      population: 10,
      maxPopulation: 1000,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: 0
    });

    // Directly adjacent (and anywhere inside the minimum spacing radius)
    // must be rejected...
    expect(townsRuntime.canPlaceTownAt(11, 10)).toBe(false);
    expect(townsRuntime.canPlaceTownAt(10, 11)).toBe(false);
    // ...while a tile at least minTownSpacing() away is still fine.
    const farEnough = townsRuntime.minTownSpacing();
    expect(townsRuntime.canPlaceTownAt(10 + farEnough, 10)).toBe(true);
  });

  it("never lets the interest-coverage backstop place a town directly adjacent to an existing town", () => {
    const deps = buildDeps();
    const townsRuntime = createServerWorldgenTowns(deps);
    // Seed a town right at the boundary between the first two 15x15 interest
    // blocks ensureInterestCoverage scans, so the neighboring (otherwise
    // "uninteresting") block's own backstop pick is likely to land close to
    // it unless spacing is enforced.
    deps.townsByTile.set(key(14, 14), {
      townId: "town-seed",
      tileKey: key(14, 14),
      type: "MARKET",
      population: 10,
      maxPopulation: 1000,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: 0
    });

    townsRuntime.ensureInterestCoverage(11);

    const minSpacing = townsRuntime.minTownSpacing();
    const towns = [...deps.townsByTile.values()];
    for (let i = 0; i < towns.length; i += 1) {
      for (let j = i + 1; j < towns.length; j += 1) {
        const [ax, ay] = towns[i]!.tileKey.split(",").map(Number) as [number, number];
        const [bx, by] = towns[j]!.tileKey.split(",").map(Number) as [number, number];
        const distance = Math.abs(ax - bx) + Math.abs(ay - by);
        expect(distance).toBeGreaterThanOrEqual(minSpacing);
      }
    }
  });
});
