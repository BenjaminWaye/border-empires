import type { StructureInfoKey } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

// Names whichever of fort/siegeOutpost/observatory/economicStructure is
// built on the tile, as a key into the shared structure detail overlay
// (client-structure-info-overlay.ts), or undefined if none is built.
export const structureKeyForTile = (tile: Tile): StructureInfoKey | undefined => {
  if (tile.economicStructure) return tile.economicStructure.type as StructureInfoKey;
  if (tile.fort) return (tile.fort.variant ?? "FORT") as StructureInfoKey;
  if (tile.siegeOutpost) return (tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as StructureInfoKey;
  if (tile.observatory) return "OBSERVATORY";
  return undefined;
};
