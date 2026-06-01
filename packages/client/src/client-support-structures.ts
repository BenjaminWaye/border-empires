import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
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
  | "EXCHANGE_HOUSE"
  | "RAIL_DEPOT"
  | "IMPERIAL_EXCHANGE_PART"
  | "WORLD_ENGINE_PART"
  | "AEGIS_DOME_PART"
  | "ASTRAL_DOCK_PART";

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
  EXCHANGE_HOUSE: ["EXCHANGE_HOUSE"],
  RAIL_DEPOT: ["RAIL_DEPOT"],
  IMPERIAL_EXCHANGE_PART: ["IMPERIAL_EXCHANGE_PART"],
  WORLD_ENGINE_PART: ["WORLD_ENGINE_PART"],
  AEGIS_DOME_PART: ["AEGIS_DOME_PART"],
  ASTRAL_DOCK_PART: ["ASTRAL_DOCK_PART"]
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
