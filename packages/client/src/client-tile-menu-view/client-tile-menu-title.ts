import { resourceLabel } from "../client-map-display.js";
import { townCharacterLabelForProfile } from "../client-town-terrain-modifiers/client-town-terrain-modifiers.js";
import { townTerrainForTile } from "../client-town-terrain-modifiers/client-town-tile-terrain.js";
import type { Tile } from "../client-types.js";

export type TileMenuTitle = {
  titleLabel: string;
  townCharacter?: string;
};

export const tileMenuTitleForTile = (
  tile: Tile,
  prettyToken: (value: string) => string,
  terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string
): TileMenuTitle => {
  if (tile.town) {
    const { terrainProfile, coastal } = townTerrainForTile(tile, tile.town);
    return {
      titleLabel: tile.town.name ?? prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type),
      townCharacter: townCharacterLabelForProfile(terrainProfile, coastal)
    };
  }
  if (tile.dockId) return { titleLabel: "Dock" };
  if (tile.resource) return { titleLabel: prettyToken(resourceLabel(tile.resource)) };
  return { titleLabel: terrainLabel(tile.x, tile.y, tile.terrain) };
};
