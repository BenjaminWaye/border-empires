import { resourceLabel } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

// Names whichever of fort/siegeOutpost/observatory/economicStructure is
// built on the tile, or undefined if none is.
const structureLabelForTile = (tile: Tile, prettyToken: (value: string) => string): string | undefined => {
  if (tile.economicStructure) return prettyToken(tile.economicStructure.type);
  if (tile.fort) return prettyToken(tile.fort.variant ?? "FORT");
  if (tile.siegeOutpost) return prettyToken(tile.siegeOutpost.variant ?? "SIEGE_OUTPOST");
  if (tile.observatory) return "Observatory";
  return undefined;
};

// The tile info panel's heading label: town -> built structure -> dock ->
// resource -> terrain, in that priority order.
export const titleLabelForTile = (
  tile: Tile,
  deps: {
    prettyToken: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
  }
): string => {
  if (tile.town) return tile.town.name ?? deps.prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type);
  const structureLabel = structureLabelForTile(tile, deps.prettyToken);
  if (structureLabel) return structureLabel;
  if (tile.dockId) return "Dock";
  if (tile.resource) return deps.prettyToken(resourceLabel(tile.resource));
  return deps.terrainLabel(tile.x, tile.y, tile.terrain);
};
