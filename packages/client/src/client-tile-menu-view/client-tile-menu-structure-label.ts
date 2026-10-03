import { defendingFortVariant } from "@border-empires/shared";
import type { StructureInfoKey } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

// Every structure built on the tile, fortification first, as keys into the
// shared structure detail overlay (client-structure-info-overlay.ts). A tile
// can hold a fortification (Palisade/Fort tier) alongside a Relay Beacon or
// Harbor Exchange, so this is a list, not "the" structure. A fort mid-upgrade
// is named by the tier still standing.
export const structureKeysForTile = (tile: Tile): StructureInfoKey[] => {
  const keys: StructureInfoKey[] = [];
  if (tile.fort) keys.push((defendingFortVariant(tile.fort) ?? tile.fort.variant ?? "FORT") as StructureInfoKey);
  if (tile.siegeOutpost) keys.push((tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as StructureInfoKey);
  if (tile.observatory) keys.push("OBSERVATORY");
  if (tile.economicStructure) keys.push(tile.economicStructure.type as StructureInfoKey);
  return keys;
};
