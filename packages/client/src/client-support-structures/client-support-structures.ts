import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type SupportTownStructureKey =
  | "MARKET"
  | "GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "FUR_SYNTHESIZER"
  | "IRONWORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "RAIL_DEPOT"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "WORLD_ENGINE_PART_1"
  | "WORLD_ENGINE_PART_2"
  | "WORLD_ENGINE_PART_3"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3"
  | "IRON_LEVY_PART_1"
  | "IRON_LEVY_PART_2"
  | "IRON_LEVY_PART_3"
  | "ASSEMBLY_WORKS"
  | "LOGISTICS_GUILD";

const SUPPORT_STRUCTURE_TYPES: Record<SupportTownStructureKey, ReadonlyArray<NonNullable<Tile["economicStructure"]>["type"]>> = {
  MARKET: ["MARKET"],
  GRANARY: ["GRANARY"],
  CENSUS_HALL: ["CENSUS_HALL"],
  CLEARING_HOUSE: ["CLEARING_HOUSE"],
  CARAVANARY: ["CARAVANARY"],
  FUR_SYNTHESIZER: ["FUR_SYNTHESIZER", "ADVANCED_FUR_SYNTHESIZER"],
  IRONWORKS: ["IRONWORKS", "ADVANCED_IRONWORKS"],
  CRYSTAL_SYNTHESIZER: ["CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"],
  RAIL_DEPOT: ["RAIL_DEPOT"],
  IMPERIAL_EXCHANGE_PART_1: ["IMPERIAL_EXCHANGE_PART_1"],
  IMPERIAL_EXCHANGE_PART_2: ["IMPERIAL_EXCHANGE_PART_2"],
  IMPERIAL_EXCHANGE_PART_3: ["IMPERIAL_EXCHANGE_PART_3"],
  WORLD_ENGINE_PART_1: ["WORLD_ENGINE_PART_1"],
  WORLD_ENGINE_PART_2: ["WORLD_ENGINE_PART_2"],
  WORLD_ENGINE_PART_3: ["WORLD_ENGINE_PART_3"],
  AEGIS_DOME_PART_1: ["AEGIS_DOME_PART_1"],
  AEGIS_DOME_PART_2: ["AEGIS_DOME_PART_2"],
  AEGIS_DOME_PART_3: ["AEGIS_DOME_PART_3"],
  ASTRAL_DOCK_PART_1: ["ASTRAL_DOCK_PART_1"],
  ASTRAL_DOCK_PART_2: ["ASTRAL_DOCK_PART_2"],
  ASTRAL_DOCK_PART_3: ["ASTRAL_DOCK_PART_3"],
  POPULATION_BUREAU_PART_1: ["POPULATION_BUREAU_PART_1"],
  POPULATION_BUREAU_PART_2: ["POPULATION_BUREAU_PART_2"],
  POPULATION_BUREAU_PART_3: ["POPULATION_BUREAU_PART_3"],
  IRON_LEVY_PART_1: ["IRON_LEVY_PART_1"],
  IRON_LEVY_PART_2: ["IRON_LEVY_PART_2"],
  IRON_LEVY_PART_3: ["IRON_LEVY_PART_3"],
  ASSEMBLY_WORKS: ["ASSEMBLY_WORKS"],
  LOGISTICS_GUILD: ["LOGISTICS_GUILD"]
};

const isTownSupportNeighbor = (town: Tile, tile: Tile): boolean => {
  const dx = Math.min(Math.abs(town.x - tile.x), WORLD_WIDTH - Math.abs(town.x - tile.x));
  const dy = Math.min(Math.abs(town.y - tile.y), WORLD_HEIGHT - Math.abs(town.y - tile.y));
  return !(dx === 0 && dy === 0) && dx <= 1 && dy <= 1;
};

const assignedTownForSupportTile = (tiles: Iterable<Tile>, supportTile: Tile, ownerId: string): Tile | undefined =>
  [...tiles]
    .filter(
      (candidate) =>
        candidate.town &&
        candidate.town.populationTier !== "SETTLEMENT" &&
        candidate.ownerId === ownerId &&
        candidate.ownershipState === "SETTLED" &&
        isTownSupportNeighbor(candidate, supportTile)
    )
    .sort((a, b) => a.x - b.x || a.y - b.y)[0];

export const townHasSupportStructureType = (
  tiles: Iterable<Tile>,
  town: Tile | undefined,
  ownerId: string | undefined,
  structureType: SupportTownStructureKey
): boolean => {
  if (!town || !ownerId) return false;
  const matchingTypes = SUPPORT_STRUCTURE_TYPES[structureType];
  const tileList = [...tiles];
  for (const tile of tileList) {
    if (!isTownSupportNeighbor(town, tile)) continue;
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
    const assignedTown = assignedTownForSupportTile(tileList, tile, ownerId);
    if (!assignedTown || assignedTown.x !== town.x || assignedTown.y !== town.y) continue;
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== ownerId) continue;
    if (matchingTypes.includes(structure.type)) return true;
  }
  return false;
};
