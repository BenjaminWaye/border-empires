import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type SupportTownStructureKey =
  | "MARKET"
  | "GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "UMBRITE_SYNTHESIZER"
  | "TITANIUM_WORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "RAIL_DEPOT"
  | "IMPERIAL_EXCHANGE_PART"
  | "WORLD_ENGINE_PART"
  | "AEGIS_DOME_PART"
  | "ASTRAL_DOCK_PART"
  | "POPULATION_BUREAU_PART"
  | "TITANIUM_LEVY_PART"
  | "ASSEMBLY_WORKS"
  | "LOGISTICS_GUILD";

const SUPPORT_STRUCTURE_TYPES: Record<SupportTownStructureKey, ReadonlyArray<NonNullable<Tile["economicStructure"]>["type"]>> = {
  MARKET: ["MARKET"],
  GRANARY: ["GRANARY"],
  CENSUS_HALL: ["CENSUS_HALL"],
  CLEARING_HOUSE: ["CLEARING_HOUSE"],
  CARAVANARY: ["CARAVANARY"],
  UMBRITE_SYNTHESIZER: ["UMBRITE_SYNTHESIZER", "ADVANCED_UMBRITE_SYNTHESIZER"],
  TITANIUM_WORKS: ["TITANIUM_WORKS", "ADVANCED_TITANIUM_WORKS"],
  CRYSTAL_SYNTHESIZER: ["CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER"],
  RAIL_DEPOT: ["RAIL_DEPOT"],
  IMPERIAL_EXCHANGE_PART: ["IMPERIAL_EXCHANGE_PART"],
  WORLD_ENGINE_PART: ["WORLD_ENGINE_PART"],
  AEGIS_DOME_PART: ["AEGIS_DOME_PART"],
  ASTRAL_DOCK_PART: ["ASTRAL_DOCK_PART"],
  POPULATION_BUREAU_PART: ["POPULATION_BUREAU_PART"],
  TITANIUM_LEVY_PART: ["TITANIUM_LEVY_PART"],
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
