import { terrainAt, wrapX, wrapY, WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { createServerWorldgenDocks, key, LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD } from "@border-empires/game-domain";

/**
 * Shared factory for the docks worldgen runtime, called identically from
 * both season-seed-world.ts (sync) and season-seed-world-async.ts
 * (cooperative-yield) to avoid duplicating the full dependency wiring in
 * both files (same convention as createSeasonNaturalWondersRuntime and
 * createSeasonOasisRuntime).
 */
export const createSeasonDocksRuntime = (
  terrainRuntime: {
    seeded01: (x: number, y: number, seed: number) => number;
    adjacentOceanSea: (x: number, y: number, oceanMask: Uint8Array) => { x: number; y: number } | undefined;
    largestSeaComponentMask: () => Uint8Array;
  },
  clusterByTile: Map<TileKey, string>,
  docksByTile: Map<TileKey, never>,
  dockById: Map<string, never>
) =>
  createServerWorldgenDocks({
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    key,
    wrapX,
    wrapY,
    worldIndex: (x, y) => y * WORLD_WIDTH + x,
    terrainAt,
    adjacentOceanSea: terrainRuntime.adjacentOceanSea,
    largestSeaComponentMask: terrainRuntime.largestSeaComponentMask,
    clusterByTile,
    LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD,
    docksByTile,
    dockById,
    getDockLinkedTileKeysByDockTileKey: () => new Map()
  });
