import type { Tile } from "./client-types.js";

export type TileTownIdentity = {
  type: "MARKET" | "FARMING";
  name?: string;
  populationTier: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
};

export const townIdentityForTile = (tile: Tile | undefined): TileTownIdentity | undefined => {
  if (!tile) return undefined;
  if (tile.town) {
    return {
      ...(tile.town.name ? { name: tile.town.name } : {}),
      type: tile.town.type,
      populationTier: tile.town.populationTier
    };
  }
  if (!tile.townType) return undefined;
  return {
    ...(tile.townName ? { name: tile.townName } : {}),
    type: tile.townType,
    populationTier: tile.townPopulationTier ?? "SETTLEMENT"
  };
};

export const tileHasTownIdentity = (tile: Tile | undefined): boolean => Boolean(townIdentityForTile(tile));
