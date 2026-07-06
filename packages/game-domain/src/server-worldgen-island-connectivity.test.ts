import { describe, expect, it } from "vitest";

import type { Tile, TileKey } from "@border-empires/shared";

import { createServerWorldgenIslandConnectivity } from "./server-worldgen-island-connectivity.js";

describe("server worldgen island connectivity", () => {
  const createConnectivityTestRuntime = ({
    landTiles,
    mountainTiles = [],
    worldWidth = 16,
    worldHeight = 16
  }: {
    landTiles: Iterable<TileKey>;
    mountainTiles?: Iterable<TileKey>;
    worldWidth?: number;
    worldHeight?: number;
  }) => {
    const WORLD_WIDTH = worldWidth;
    const WORLD_HEIGHT = worldHeight;
    const key = (x: number, y: number): TileKey => `${x},${y}`;
    const wrapX = (x: number, width: number) => ((x % width) + width) % width;
    const wrapY = (y: number, height: number) => ((y % height) + height) % height;
    const landTileSet = new Set(landTiles);
    const mountainTileSet = new Set(mountainTiles);
    const terrainAt = (x: number, y: number): Tile["terrain"] => {
      const tileKey = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
      if (mountainTileSet.has(tileKey)) return "MOUNTAIN";
      if (landTileSet.has(tileKey)) return "LAND";
      return "SEA";
    };
    const overrideTerrainAt = (x: number, y: number, terrain: Tile["terrain"]): void => {
      const tileKey = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
      mountainTileSet.delete(tileKey);
      landTileSet.delete(tileKey);
      if (terrain === "MOUNTAIN") mountainTileSet.add(tileKey);
      if (terrain === "LAND") landTileSet.add(tileKey);
    };
    const runtime = createServerWorldgenIslandConnectivity({
      WORLD_WIDTH,
      WORLD_HEIGHT,
      wrapX,
      wrapY,
      terrainAt,
      overrideTerrainAt
    });
    return { runtime, terrainAt, landTileSet, mountainTileSet };
  };

  const hasSeaAdjacentLand = (
    terrainAt: (x: number, y: number) => Tile["terrain"],
    landTiles: Iterable<TileKey>
  ): boolean => {
    for (const tileKey of landTiles) {
      const [xStr, yStr] = tileKey.split(",");
      const x = Number(xStr);
      const y = Number(yStr);
      const neighbors: Array<[number, number]> = [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y]
      ];
      if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) === "SEA")) return true;
    }
    return false;
  };

  it("carves a channel through a mountain ring so a fully enclosed island reaches sea", () => {
    // A 3x3 island at (5,5)-(7,7) ringed by a mountain border, with open
    // sea beyond the ring.
    const landTiles: TileKey[] = [];
    for (let y = 5; y <= 7; y += 1) {
      for (let x = 5; x <= 7; x += 1) landTiles.push(`${x},${y}`);
    }
    const mountainTiles: TileKey[] = [];
    for (let y = 4; y <= 8; y += 1) {
      for (let x = 4; x <= 8; x += 1) {
        if (x === 4 || x === 8 || y === 4 || y === 8) mountainTiles.push(`${x},${y}`);
      }
    }
    const { runtime, terrainAt, landTileSet } = createConnectivityTestRuntime({ landTiles, mountainTiles });

    expect(hasSeaAdjacentLand(terrainAt, landTileSet)).toBe(false);
    runtime.ensureLandMassesReachSea();
    expect(hasSeaAdjacentLand(terrainAt, landTileSet)).toBe(true);
  });

  it("leaves an already-coastal island untouched", () => {
    const landTiles: TileKey[] = ["5,5", "6,5", "5,6", "6,6"];
    const { runtime, terrainAt, mountainTileSet } = createConnectivityTestRuntime({ landTiles });
    const beforeMountainCount = mountainTileSet.size;

    runtime.ensureLandMassesReachSea();

    expect(mountainTileSet.size).toBe(beforeMountainCount);
    for (const tileKey of landTiles) {
      const [xStr, yStr] = tileKey.split(",");
      expect(terrainAt(Number(xStr), Number(yStr))).toBe("LAND");
    }
  });

  it("does nothing when a mountain-ringed land mass has no path to sea", () => {
    // The whole world is land/mountain with no sea tiles at all: nothing
    // safe to carve, and the pass must terminate without throwing.
    const WORLD_SPAN = 16;
    const landTiles: TileKey[] = [];
    const mountainTiles: TileKey[] = [];
    for (let y = 0; y < WORLD_SPAN; y += 1) {
      for (let x = 0; x < WORLD_SPAN; x += 1) {
        if (x >= 5 && x <= 7 && y >= 5 && y <= 7) landTiles.push(`${x},${y}`);
        else mountainTiles.push(`${x},${y}`);
      }
    }
    const { runtime, terrainAt } = createConnectivityTestRuntime({ landTiles, mountainTiles });

    expect(() => runtime.ensureLandMassesReachSea()).not.toThrow();
    expect(terrainAt(6, 6)).toBe("LAND");
  });

  it("carves separate channels for two distinct landlocked islands", () => {
    const islandALand: TileKey[] = ["2,2", "3,2", "2,3", "3,3"];
    const islandARing: TileKey[] = [];
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 4; x += 1) {
        if (x === 1 || x === 4 || y === 1 || y === 4) islandARing.push(`${x},${y}`);
      }
    }
    const islandBLand: TileKey[] = ["10,10", "11,10", "10,11", "11,11"];
    const islandBRing: TileKey[] = [];
    for (let y = 9; y <= 12; y += 1) {
      for (let x = 9; x <= 12; x += 1) {
        if (x === 9 || x === 12 || y === 9 || y === 12) islandBRing.push(`${x},${y}`);
      }
    }
    const { runtime, terrainAt } = createConnectivityTestRuntime({
      landTiles: [...islandALand, ...islandBLand],
      mountainTiles: [...islandARing, ...islandBRing]
    });

    runtime.ensureLandMassesReachSea();

    expect(hasSeaAdjacentLand(terrainAt, islandALand)).toBe(true);
    expect(hasSeaAdjacentLand(terrainAt, islandBLand)).toBe(true);
  });

  it("routes through a neighboring land mass when a mountain-only path never reaches sea", () => {
    // A pocket ringed by mountain, but that ring is itself buried inside a
    // much larger landmass whose own shore is further out. A mountain-only
    // search from the pocket would exhaust every reachable mountain tile
    // without ever touching sea, so the corridor must be allowed to cross
    // the surrounding land mass's tiles too.
    const worldWidth = 14;
    const worldHeight = 14;
    const pocketLand: TileKey[] = ["6,6", "7,6", "6,7", "7,7"];
    const ring: TileKey[] = [];
    for (let y = 5; y <= 8; y += 1) {
      for (let x = 5; x <= 8; x += 1) {
        if (x === 5 || x === 8 || y === 5 || y === 8) ring.push(`${x},${y}`);
      }
    }
    const foreignLand: TileKey[] = [];
    for (let y = 2; y <= 11; y += 1) {
      for (let x = 2; x <= 11; x += 1) {
        const tk: TileKey = `${x},${y}`;
        if (pocketLand.includes(tk) || ring.includes(tk)) continue;
        foreignLand.push(tk);
      }
    }
    // Everything outside x/y in [2,11] is left as the default SEA.

    const { runtime, terrainAt } = createConnectivityTestRuntime({
      landTiles: [...pocketLand, ...foreignLand],
      mountainTiles: ring,
      worldWidth,
      worldHeight
    });

    expect(hasSeaAdjacentLand(terrainAt, pocketLand)).toBe(false);
    runtime.ensureLandMassesReachSea();
    expect(hasSeaAdjacentLand(terrainAt, pocketLand)).toBe(true);
  });
});
