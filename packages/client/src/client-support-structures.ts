import type { Tile } from "./client-types.js";

export type SupportTownStructureKey =
  | "MARKET"
  | "GRANARY"
  | "CENSUS_HALL"
  | "BANK"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "FUEL_PLANT"
  | "EXCHANGE_HOUSE"
  | "RAIL_DEPOT"
  | "IMPERIAL_EXCHANGE_PART"
  | "WORLD_ENGINE_PART"
  | "AEGIS_DOME_PART";

const SUPPORT_STRUCTURE_TYPES: Record<SupportTownStructureKey, ReadonlyArray<NonNullable<Tile["economicStructure"]>["type"]>> = {
  MARKET: ["MARKET"],
  GRANARY: ["GRANARY"],
  CENSUS_HALL: ["CENSUS_HALL"],
  BANK: ["BANK"],
  CLEARING_HOUSE: ["CLEARING_HOUSE"],
  CARAVANARY: ["CARAVANARY"],
  FUR_SYNTHESIZER: ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER"],
  IRONWORKS: ["IRONWORKS", "ADVANCED_IRONWORKS"],
  CRYSTAL_SYNTHESIZER: ["CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"],
  FUEL_PLANT: ["FUEL_PLANT"],
  EXCHANGE_HOUSE: ["EXCHANGE_HOUSE"],
  RAIL_DEPOT: ["RAIL_DEPOT"],
  IMPERIAL_EXCHANGE_PART: ["IMPERIAL_EXCHANGE_PART"],
  WORLD_ENGINE_PART: ["WORLD_ENGINE_PART"],
  AEGIS_DOME_PART: ["AEGIS_DOME_PART"]
};

const isTownSupportNeighbor = (town: Tile, tile: Tile): boolean => {
  const dx = Math.abs(town.x - tile.x);
  const dy = Math.abs(town.y - tile.y);
  return !(dx === 0 && dy === 0) && dx <= 1 && dy <= 1;
};

export const townHasSupportStructureType = (
  tiles: Iterable<Tile>,
  town: Tile | undefined,
  ownerId: string | undefined,
  structureType: SupportTownStructureKey
): boolean => {
  if (!town || !ownerId) return false;
  const matchingTypes = SUPPORT_STRUCTURE_TYPES[structureType];
  for (const tile of tiles) {
    if (!isTownSupportNeighbor(town, tile)) continue;
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== ownerId) continue;
    if (matchingTypes.includes(structure.type)) return true;
  }
  return false;
};
