import { describe, expect, it } from "vitest";
import type { ResourceType, TileKey } from "@border-empires/shared";

import type { ClusterDefinition } from "./server-shared-types.js";
import { landDistanceFromTowns, NOT_IN_REACH } from "./server-worldgen-strategic-reach-geometry.js";
import { ensureStrategicClustersInReach, type StrategicReachDeps } from "./server-worldgen-strategic-reach.js";

// Small synthetic world: 60x24, all LAND except a two-tile-wide sea channel
// at x = 8..9 (full height). One town at (4, 12). The world wraps, so the
// land route from the town to the far side of the channel goes the long way
// round (~54 steps) — well past the 10-step reach.
const WIDTH = 60;
const HEIGHT = 24;
const TOWN = { x: 4, y: 12 };
const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (tileKey: TileKey): [number, number] => {
  const [x, y] = tileKey.split(",").map(Number);
  return [x!, y!];
};
const terrainAt = (x: number): string => (x === 8 || x === 9 ? "SEA" : "LAND");
const hash01 = (x: number, y: number, seed: number): number => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

type World = { clusterByTile: Map<TileKey, string>; clustersById: Map<string, ClusterDefinition>; deps: StrategicReachDeps };

const buildWorld = (habitatAllowed: (x: number, y: number) => boolean = () => true): World => {
  const clusterByTile = new Map<TileKey, string>();
  const clustersById = new Map<string, ClusterDefinition>();
  const allowed = (x: number, y: number): boolean => terrainAt(x) === "LAND" && habitatAllowed(x, y);
  // Two-tile horizontal clusters: the centre and its east neighbour.
  const collect = (cx: number, cy: number): TileKey[] => {
    const tiles = [key(cx, cy), key((cx + 1) % WIDTH, cy)];
    return tiles.every((tileKey) => {
      const [x, y] = parseKey(tileKey);
      return allowed(x, y) && !clusterByTile.has(tileKey);
    })
      ? tiles
      : [];
  };
  const deps: StrategicReachDeps = {
    WORLD_WIDTH: WIDTH,
    WORLD_HEIGHT: HEIGHT,
    terrainAt,
    key,
    parseKey,
    isHillsTileAt: () => false,
    clusterByTile,
    clustersById,
    townsByTile: new Map([[key(TOWN.x, TOWN.y), true]]),
    docksByTile: new Map(),
    habitat: {
      seeded01: hash01,
      resourcePlacementAllowed: (x, y) => allowed(x, y),
      collectClusterTiles: collect,
      collectClusterTilesRelaxed: collect,
      clusterTileCountForResource: () => 2,
      clusterRadiusForResource: () => 1,
      clusterResourceType: (cluster) => cluster.resourceType ?? "FARM"
    }
  };
  return { clusterByTile, clustersById, deps };
};

const addCluster = (world: World, clusterId: string, resourceType: ResourceType, tiles: Array<[number, number]>): void => {
  world.clustersById.set(clusterId, {
    clusterId,
    clusterType: "TITANIUM_HILLS",
    resourceType,
    centerX: tiles[0]![0],
    centerY: tiles[0]![1],
    radius: 1,
    controlThreshold: 1
  });
  for (const [x, y] of tiles) world.clusterByTile.set(key(x, y), clusterId);
};

const tilesOf = (world: World, clusterId: string): Array<[number, number]> =>
  [...world.clusterByTile.entries()].filter(([, id]) => id === clusterId).map(([tileKey]) => parseKey(tileKey));

const landDistance = (): Int16Array =>
  landDistanceFromTowns({ WORLD_WIDTH: WIDTH, WORLD_HEIGHT: HEIGHT }, [TOWN], (x) => terrainAt(x) === "LAND", 10);

const expectValidPlacement = (tiles: Array<[number, number]>): void => {
  const distance = landDistance();
  expect(tiles.length).toBe(2);
  expect(tiles.some(([x, y]) => distance[y * WIDTH + x] !== NOT_IN_REACH)).toBe(true);
  for (const [x, y] of tiles) {
    const dx = Math.min(Math.abs(x - TOWN.x), WIDTH - Math.abs(x - TOWN.x));
    const dy = Math.min(Math.abs(y - TOWN.y), HEIGHT - Math.abs(y - TOWN.y));
    expect(Math.max(dx, dy)).toBeGreaterThan(2);
  }
};

describe("ensureStrategicClustersInReach", () => {
  it("measures reach over land only, 8-way", () => {
    const distance = landDistance();
    expect(distance[TOWN.y * WIDTH + TOWN.x]).toBe(0);
    expect(distance[(TOWN.y + 3) * WIDTH + (TOWN.x - 3)]).toBe(3); // diagonal steps count as 1
    expect(distance[TOWN.y * WIDTH + 10]).toBe(NOT_IN_REACH); // 6 tiles away, but across the channel
    expect(distance[TOWN.y * WIDTH + 8]).toBe(NOT_IN_REACH); // sea
  });

  it("keeps an in-reach cluster clear of the rings, and moves out-of-reach and ring-overlapping ones", () => {
    const world = buildWorld();
    addCluster(world, "fine", "TITANIUM", [[4, 18], [5, 18]]); // 6 land steps, outside both rings
    addCluster(world, "far", "UMBRITE", [[35, 12], [36, 12]]); // ~30 tiles away
    addCluster(world, "across", "TITANIUM", [[11, 12], [12, 12]]); // Chebyshev 7, but across the channel
    addCluster(world, "ring", "GEMS", [[5, 13], [6, 13]]); // inside the first/second support ring
    addCluster(world, "food", "FARM", [[40, 3], [41, 3]]); // not strategic: never touched

    const result = ensureStrategicClustersInReach(42, world.deps);

    expect(result).toEqual({ checked: 4, moved: 3, failed: 0 });
    expect(tilesOf(world, "fine")).toEqual([[4, 18], [5, 18]]);
    expect(tilesOf(world, "food")).toEqual([[40, 3], [41, 3]]);
    for (const clusterId of ["far", "across", "ring"]) {
      const tiles = tilesOf(world, clusterId);
      expectValidPlacement(tiles);
      const cluster = world.clustersById.get(clusterId)!;
      expect(tiles[0]).toEqual([cluster.centerX, cluster.centerY]); // centre follows the move
    }
    expect(world.clustersById.get("far")!.resourceType).toBe("UMBRITE");
  });

  it("moves a cluster when one of its fields is out of reach even though another field is in reach", () => {
    const world = buildWorld();
    addCluster(world, "split", "TITANIUM", [[4, 18], [30, 18]]); // two separate fields, one far away
    const result = ensureStrategicClustersInReach(7, world.deps);
    expect(result.moved).toBe(1);
    const tiles = tilesOf(world, "split");
    expectValidPlacement(tiles);
    const distance = landDistance();
    expect(tiles.every(([x, y]) => distance[y * WIDTH + x] !== NOT_IN_REACH)).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const run = (): Array<[TileKey, string]> => {
      const world = buildWorld();
      addCluster(world, "far", "UMBRITE", [[35, 12], [36, 12]]);
      addCluster(world, "ring", "GEMS", [[5, 13], [6, 13]]);
      ensureStrategicClustersInReach(99, world.deps);
      return [...world.clusterByTile.entries()].sort();
    };
    expect(run()).toEqual(run());
  });

  it("leaves a cluster in place and counts it as failed when no valid spot exists", () => {
    const world = buildWorld((x) => x > 20 && x < 40); // habitat only on the far side
    addCluster(world, "far", "UMBRITE", [[35, 12], [36, 12]]);
    const result = ensureStrategicClustersInReach(3, world.deps);
    expect(result).toEqual({ checked: 1, moved: 0, failed: 1 });
    expect(tilesOf(world, "far")).toEqual([[35, 12], [36, 12]]);
  });
});
