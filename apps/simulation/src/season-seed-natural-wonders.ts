import { WORLD_HEIGHT, WORLD_WIDTH, grassShadeAt, landBiomeAt, terrainAt, type RegionType, type TileKey } from "@border-empires/shared";
import {
  createServerWorldgenNaturalWonders,
  key,
  type ClusterDefinition,
  type NaturalWonderSiteState,
  type TownDefinition
} from "@border-empires/game-domain";
import type { GeneratedDockState } from "./season-seed-world.js";

/**
 * Shared factory for the natural-wonders worldgen runtime, called identically
 * from both season-seed-world.ts (sync) and season-seed-world-async.ts
 * (cooperative-yield) to avoid duplicating the full dependency wiring in
 * both files.
 */
export const createSeasonNaturalWondersRuntime = (
  terrainRuntime: { seeded01: (x: number, y: number, seed: number) => number; regionTypeAtLocal: (x: number, y: number) => RegionType | undefined },
  naturalWondersByTile: Map<TileKey, NaturalWonderSiteState>,
  docksByTile: Map<TileKey, GeneratedDockState>,
  clusterByTile: Map<TileKey, string>,
  clustersById: Map<string, ClusterDefinition>,
  townsByTile: Map<TileKey, TownDefinition>
) =>
  createServerWorldgenNaturalWonders({
    seeded01: terrainRuntime.seeded01,
    naturalWondersByTile,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    regionTypeAtLocal: terrainRuntime.regionTypeAtLocal,
    landBiomeAt,
    grassShadeAt,
    key,
    docksByTile: docksByTile as Map<TileKey, never>,
    clusterByTile,
    clustersById,
    townsByTile
  });
