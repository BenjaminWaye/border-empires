import { describe, expect, it } from "vitest";

import type { Dock, TileKey } from "@border-empires/shared";

import { createServerWorldgenDocks } from "./server-worldgen-docks.js";

describe("server worldgen docks", () => {
  const createDockTestRuntime = ({
    landTiles,
    clusteredTiles = []
  }: {
    landTiles: Iterable<TileKey>;
    clusteredTiles?: Iterable<TileKey>;
  }) => {
    const WORLD_WIDTH = 12;
    const WORLD_HEIGHT = 12;
    const key = (x: number, y: number): TileKey => `${x},${y}`;
    const wrapX = (x: number, width: number) => ((x % width) + width) % width;
    const wrapY = (y: number, height: number) => ((y % height) + height) % height;
    const worldIndex = (x: number, y: number) => y * WORLD_WIDTH + x;
    const landTileSet = new Set(landTiles);
    const clusteredTileSet = new Set(clusteredTiles);
    const terrainAt = (x: number, y: number): "LAND" | "SEA" => (landTileSet.has(key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT))) ? "LAND" : "SEA");
    const largestSeaComponentMask = () => {
      const mask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let x = 0; x < WORLD_WIDTH; x += 1) {
          if (terrainAt(x, y) === "SEA") mask[worldIndex(x, y)] = 1;
        }
      }
      return mask;
    };
    const adjacentOceanSea = (x: number, y: number, oceanMask: Uint8Array): { x: number; y: number } | undefined => {
      for (const [nx, ny] of [
        [wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)],
        [wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)],
        [wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)],
        [wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)]
      ] as const) {
        if (terrainAt(nx, ny) !== "SEA") continue;
        if (!oceanMask[worldIndex(nx, ny)]) continue;
        return { x: nx, y: ny };
      }
      return undefined;
    };
    const docksByTile = new Map<TileKey, Dock>();
    const dockById = new Map<string, Dock>();
    const dockLinkedTileKeysByDockTileKey = new Map<TileKey, TileKey[]>();

    const runtime = createServerWorldgenDocks({
      seeded01: (x, y, seed) => {
        const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
        return n - Math.floor(n);
      },
      WORLD_WIDTH,
      WORLD_HEIGHT,
      key,
      wrapX,
      wrapY,
      worldIndex,
      terrainAt,
      adjacentOceanSea,
      largestSeaComponentMask,
      clusterByTile: new Map([...clusteredTileSet].map((tileKey) => [tileKey, "cluster-1"])),
      LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD: 999,
      docksByTile,
      dockById,
      getDockLinkedTileKeysByDockTileKey: () => dockLinkedTileKeysByDockTileKey
    });

    return { runtime, docksByTile };
  };

  it("assigns a dock to a thin disconnected island even when the island is smaller than the large-island threshold", () => {
    const thinIslandTiles = new Set<TileKey>(["1,1", "2,2", "3,3", "4,4", "5,5"]);
    const mainIslandTiles = new Set<TileKey>(["8,2", "8,3", "8,4", "9,2", "9,3", "9,4", "10,2", "10,3", "10,4"]);
    const { runtime, docksByTile } = createDockTestRuntime({ landTiles: [...thinIslandTiles, ...mainIslandTiles] });

    runtime.generateDocks(12345);

    expect(docksByTile.size).toBe(2);
    expect([...docksByTile.keys()].some((tileKey) => thinIslandTiles.has(tileKey))).toBe(true);
    expect([...docksByTile.keys()].some((tileKey) => mainIslandTiles.has(tileKey))).toBe(true);

    const thinIslandDock = [...docksByTile.values()].find((dock) => thinIslandTiles.has(dock.tileKey));
    const mainIslandDock = [...docksByTile.values()].find((dock) => mainIslandTiles.has(dock.tileKey));
    expect(thinIslandDock).toBeDefined();
    expect(mainIslandDock).toBeDefined();
    expect(thinIslandDock!.connectedDockIds).toContain(mainIslandDock!.dockId);
    expect(mainIslandDock!.connectedDockIds).toContain(thinIslandDock!.dockId);
  });

  it("falls back to clustered coast tiles when an island has no other dock candidates", () => {
    const clusteredIsletTiles = new Set<TileKey>(["1,1", "1,2", "2,1", "2,2"]);
    const mainIslandTiles = new Set<TileKey>(["8,2", "8,3", "8,4", "9,2", "9,3", "9,4", "10,2", "10,3", "10,4"]);
    const { runtime, docksByTile } = createDockTestRuntime({
      landTiles: [...clusteredIsletTiles, ...mainIslandTiles],
      clusteredTiles: clusteredIsletTiles
    });

    runtime.generateDocks(67890);

    const clusteredIsletDock = [...docksByTile.values()].find((dock) => clusteredIsletTiles.has(dock.tileKey));
    const mainIslandDock = [...docksByTile.values()].find((dock) => mainIslandTiles.has(dock.tileKey));
    expect(clusteredIsletDock).toBeDefined();
    expect(mainIslandDock).toBeDefined();
    expect(clusteredIsletDock!.connectedDockIds).toContain(mainIslandDock!.dockId);
  });
});
