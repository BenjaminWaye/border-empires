import {
  landBiomeAt,
  resolvedTownCoastal,
  resolvedTownTerrainProfileId,
  type LandBiome,
  type TownTerrainProfileId
} from "@border-empires/shared";
import type { Tile } from "../client-types.js";

type TownTileTerrain = { terrainProfile: TownTerrainProfileId; coastal: boolean };
type TownTerrainInput = { x: number; y: number; landBiome?: LandBiome | undefined };
type TownTerrainFields = { terrainProfile?: TownTerrainProfileId | undefined; coastal?: boolean | undefined };

/**
 * Resolves a town's terrain profile + coastal flag. Towns persisted before terrain
 * profiles shipped carry neither, and the wire never sends landBiome, so derive the
 * biome locally (same landBiomeAt the sim resolves from). Only computed when the town
 * has no stored profile and the tile has no biome, so the common path stays free.
 */
export const townTerrainForTile = (tile: TownTerrainInput, town: NonNullable<Tile["town"]> | TownTerrainFields): TownTileTerrain => {
  const biome = town.terrainProfile ? tile.landBiome : (tile.landBiome ?? landBiomeAt(tile.x, tile.y));
  return {
    terrainProfile: resolvedTownTerrainProfileId(town.terrainProfile, biome),
    coastal: resolvedTownCoastal(town.terrainProfile, biome, town.coastal)
  };
};
