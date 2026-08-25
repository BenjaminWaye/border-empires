import { landBiomeAt, overrideLandBiomeAt, overrideTerrainAt, terrainAt, WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { createServerWorldgenOasis, key, type ClusterDefinition } from "@border-empires/game-domain";

/**
 * Shared factory for the oasis worldgen runtime, called identically from
 * both season-seed-world.ts (sync) and season-seed-world-async.ts
 * (cooperative-yield) to avoid duplicating the full dependency wiring in
 * both files (same convention as createSeasonNaturalWondersRuntime).
 */
export const createSeasonOasisRuntime = (
  terrainRuntime: { seeded01: (x: number, y: number, seed: number) => number },
  clusterByTile: Map<TileKey, string>,
  clustersById: Map<string, ClusterDefinition>
) =>
  createServerWorldgenOasis({
    seeded01: terrainRuntime.seeded01,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    wrapX: (x, width) => ((x % width) + width) % width,
    wrapY: (y, height) => ((y % height) + height) % height,
    terrainAt,
    overrideTerrainAt,
    landBiomeAt,
    overrideLandBiomeAt,
    key,
    clusterByTile,
    clustersById
  });
