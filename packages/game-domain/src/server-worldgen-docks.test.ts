import { describe, expect, it } from "vitest";

import type { Dock, TileKey } from "@border-empires/shared";

import { createServerWorldgenDocks } from "./server-worldgen-docks.js";

describe("server worldgen docks", () => {
  const createDockTestRuntime = ({
    landTiles,
    clusteredTiles = [],
    mountainTiles = [],
    coastalSeaTiles = [],
    largeIslandMultiDockTileThreshold = 999
  }: {
    landTiles: Iterable<TileKey>;
    clusteredTiles?: Iterable<TileKey>;
    mountainTiles?: Iterable<TileKey>;
    coastalSeaTiles?: Iterable<TileKey>;
    largeIslandMultiDockTileThreshold?: number;
  }) => {
    const WORLD_WIDTH = 12;
    const WORLD_HEIGHT = 12;
    const key = (x: number, y: number): TileKey => `${x},${y}`;
    const wrapX = (x: number, width: number) => ((x % width) + width) % width;
    const wrapY = (y: number, height: number) => ((y % height) + height) % height;
    const worldIndex = (x: number, y: number) => y * WORLD_WIDTH + x;
    const landTileSet = new Set(landTiles);
    const clusteredTileSet = new Set(clusteredTiles);
    const mountainTileSet = new Set(mountainTiles);
    const coastalSeaTileSet = new Set(coastalSeaTiles);
    const terrainAt = (x: number, y: number): "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" => {
      const tileKey = key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
      if (mountainTileSet.has(tileKey)) return "MOUNTAIN";
      if (landTileSet.has(tileKey)) return "LAND";
      if (coastalSeaTileSet.has(tileKey)) return "COASTAL_SEA";
      return "SEA";
    };
    const largestSeaComponentMask = () => {
      const mask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
      const visited = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
      const queue = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT);
      let largest: number[] = [];
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let x = 0; x < WORLD_WIDTH; x += 1) {
          const startIdx = worldIndex(x, y);
          if (visited[startIdx] || terrainAt(x, y) !== "SEA") continue;
          const component: number[] = [];
          visited[startIdx] = 1;
          let head = 0;
          let tail = 0;
          queue[tail++] = startIdx;
          while (head < tail) {
            const idx = queue[head++]!;
            component.push(idx);
            const cx = idx % WORLD_WIDTH;
            const cy = Math.floor(idx / WORLD_WIDTH);
            for (const [nx, ny] of [
              [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
              [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
              [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
              [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
            ] as const) {
              const neighborIdx = worldIndex(nx, ny);
              if (visited[neighborIdx] || terrainAt(nx, ny) !== "SEA") continue;
              visited[neighborIdx] = 1;
              queue[tail++] = neighborIdx;
            }
          }
          if (component.length > largest.length) largest = component;
        }
      }
      for (const idx of largest) mask[idx] = 1;
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
      LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD: largeIslandMultiDockTileThreshold,
      docksByTile,
      dockById,
      getDockLinkedTileKeysByDockTileKey: () => dockLinkedTileKeysByDockTileKey
    });

    return { runtime, docksByTile };
  };

  it("assigns a dock to mountain-sealed land that only touches an inland sea basin", () => {
    const basinTiles = new Set<TileKey>(["2,4", "3,4", "4,4", "2,5", "4,5", "2,6", "3,6", "4,6"]);
    const mountainTiles = new Set<TileKey>(["1,3", "2,3", "3,3", "4,3", "5,3", "1,4", "5,4", "1,5", "5,5", "1,6", "5,6", "1,7", "2,7", "3,7", "4,7", "5,7"]);
    const mainIslandTiles = new Set<TileKey>(["8,2", "8,3", "8,4", "9,2", "9,3", "9,4", "10,2", "10,3", "10,4"]);
    const { runtime, docksByTile } = createDockTestRuntime({
      landTiles: [...basinTiles, ...mainIslandTiles],
      mountainTiles
    });

    runtime.generateDocks(24680);

    const basinDock = [...docksByTile.values()].find((dock) => basinTiles.has(dock.tileKey));
    const mainIslandDock = [...docksByTile.values()].find((dock) => mainIslandTiles.has(dock.tileKey));
    expect(basinDock).toBeDefined();
    expect(mainIslandDock).toBeDefined();
    expect(basinDock!.connectedDockIds).toContain(mainIslandDock!.dockId);
  });


  it("treats coastal sea as valid shoreline when placing multiple docks on a large island", () => {
    const largeIslandTiles = new Set<TileKey>();
    const coastalSeaTiles = new Set<TileKey>();
    for (let y = 2; y <= 5; y += 1) {
      for (let x = 2; x <= 5; x += 1) largeIslandTiles.add(`${x},${y}`);
    }
    for (let y = 1; y <= 6; y += 1) {
      coastalSeaTiles.add(`1,${y}`);
      coastalSeaTiles.add(`6,${y}`);
    }
    for (let x = 1; x <= 6; x += 1) {
      coastalSeaTiles.add(`${x},1`);
      coastalSeaTiles.add(`${x},6`);
    }
    const northIslandTiles = new Set<TileKey>(["8,1", "9,1", "8,2", "9,2"]);
    const southIslandTiles = new Set<TileKey>(["8,8", "9,8", "8,9", "9,9"]);
    const { runtime, docksByTile } = createDockTestRuntime({
      landTiles: [...largeIslandTiles, ...northIslandTiles, ...southIslandTiles],
      coastalSeaTiles,
      largeIslandMultiDockTileThreshold: 8
    });

    runtime.generateDocks(97531);

    const largeIslandDocks = [...docksByTile.values()].filter((dock) => largeIslandTiles.has(dock.tileKey));
    expect(largeIslandDocks).toHaveLength(2);
    expect(largeIslandDocks.every((dock) => (dock.connectedDockIds?.length ?? 0) === 1)).toBe(true);
  });


  it("gives a large island multiple dock tiles by adding extra routes beyond the spanning tree", () => {
    const largeIslandTiles = new Set<TileKey>();
    for (let y = 2; y <= 5; y += 1) {
      for (let x = 1; x <= 4; x += 1) largeIslandTiles.add(`${x},${y}`);
    }
    const northIslandTiles = new Set<TileKey>(["7,1", "8,1", "7,2", "8,2"]);
    const southIslandTiles = new Set<TileKey>(["7,7", "8,7", "7,8", "8,8"]);
    const eastIslandTiles = new Set<TileKey>(["10,4", "11,4", "10,5", "11,5"]);
    const { runtime, docksByTile } = createDockTestRuntime({
      landTiles: [...largeIslandTiles, ...northIslandTiles, ...southIslandTiles, ...eastIslandTiles],
      largeIslandMultiDockTileThreshold: 8
    });

    runtime.generateDocks(13579);

    const largeIslandDocks = [...docksByTile.values()].filter((dock) => largeIslandTiles.has(dock.tileKey));
    const northIslandDocks = [...docksByTile.values()].filter((dock) => northIslandTiles.has(dock.tileKey));
    const southIslandDocks = [...docksByTile.values()].filter((dock) => southIslandTiles.has(dock.tileKey));
    const eastIslandDocks = [...docksByTile.values()].filter((dock) => eastIslandTiles.has(dock.tileKey));
    expect(largeIslandDocks).toHaveLength(2);
    expect(northIslandDocks).toHaveLength(1);
    expect(southIslandDocks).toHaveLength(1);
    expect(eastIslandDocks).toHaveLength(1);
    expect(new Set(largeIslandDocks.map((dock) => dock.tileKey)).size).toBe(2);
    expect(new Set(largeIslandDocks.map((dock) => dock.pairedDockId)).size).toBe(2);
    expect(largeIslandDocks.every((dock) => (dock.connectedDockIds?.length ?? 0) === 1)).toBe(true);
  });


  it("keeps a second dock on a large island even when it has only one neighboring island", () => {
    const largeIslandTiles = new Set<TileKey>();
    for (let y = 2; y <= 5; y += 1) {
      for (let x = 1; x <= 4; x += 1) largeIslandTiles.add(`${x},${y}`);
    }
    const smallIslandTiles = new Set<TileKey>(["8,3", "9,3", "8,4", "9,4"]);
    const { runtime, docksByTile } = createDockTestRuntime({
      landTiles: [...largeIslandTiles, ...smallIslandTiles],
      largeIslandMultiDockTileThreshold: 8
    });

    runtime.generateDocks(86420);

    const largeIslandDocks = [...docksByTile.values()].filter((dock) => largeIslandTiles.has(dock.tileKey));
    const smallIslandDocks = [...docksByTile.values()].filter((dock) => smallIslandTiles.has(dock.tileKey));
    expect(largeIslandDocks).toHaveLength(2);
    expect(smallIslandDocks).toHaveLength(1);
    expect(largeIslandDocks.every((dock) => (dock.connectedDockIds?.length ?? 0) === 1)).toBe(true);
    expect(new Set(largeIslandDocks.flatMap((dock) => dock.connectedDockIds ?? [])).size).toBe(1);
    expect(largeIslandDocks.flatMap((dock) => dock.connectedDockIds ?? [])).toContain(smallIslandDocks[0]!.dockId);
  });
});
