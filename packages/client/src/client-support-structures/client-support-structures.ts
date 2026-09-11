import { MAX_SUPPORT_RING_RADIUS, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type SupportTownStructureKey =
  | "MINTWORKS"
  | "GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "UMBRITE_SYNTHESIZER"
  | "TITANIUM_WORKS"
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
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "ASSEMBLY_WORKS"
  | "LOGISTICS_GUILD";

const SUPPORT_STRUCTURE_TYPES: Record<SupportTownStructureKey, ReadonlyArray<NonNullable<Tile["economicStructure"]>["type"]>> = {
  MINTWORKS: ["MINTWORKS"],
  GRANARY: ["GRANARY"],
  CENSUS_HALL: ["CENSUS_HALL"],
  CLEARING_HOUSE: ["CLEARING_HOUSE"],
  CARAVANARY: ["CARAVANARY"],
  UMBRITE_SYNTHESIZER: ["UMBRITE_SYNTHESIZER", "ADVANCED_UMBRITE_SYNTHESIZER"],
  TITANIUM_WORKS: ["TITANIUM_WORKS", "ADVANCED_TITANIUM_WORKS"],
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
  TITANIUM_LEVY_PART_1: ["TITANIUM_LEVY_PART_1"],
  TITANIUM_LEVY_PART_2: ["TITANIUM_LEVY_PART_2"],
  TITANIUM_LEVY_PART_3: ["TITANIUM_LEVY_PART_3"],
  ASSEMBLY_WORKS: ["ASSEMBLY_WORKS"],
  LOGISTICS_GUILD: ["LOGISTICS_GUILD"]
};

// Scans outward from `supportTile` (bounded to the widest possible ring,
// MAX_SUPPORT_RING_RADIUS) instead of walking every known tile -- see
// town-support-ring.ts's doc comment for why an unbounded/hand-rolled scan
// here is exactly the bug class that module exists to prevent. Each
// candidate town is filtered by ITS OWN tier's radius (a Town-tier neighbor
// at distance 2 doesn't claim this tile even though a Great City neighbor at
// distance 2 would).
const assignedTownForSupportTile = (tiles: ReadonlyMap<string, Tile>, supportTile: Tile, ownerId: string): Tile | undefined =>
  supportRingCandidates(tiles, supportTile.x, supportTile.y, MAX_SUPPORT_RING_RADIUS)
    .filter(
      ({ tile: candidate, dx, dy }) =>
        candidate.town &&
        candidate.town.populationTier !== "SETTLEMENT" &&
        candidate.ownerId === ownerId &&
        candidate.ownershipState === "SETTLED" &&
        Math.max(Math.abs(dx), Math.abs(dy)) <= supportRingRadiusForTier(candidate.town.populationTier)
    )
    .map(({ tile: candidate }) => candidate)
    .sort((a, b) => a.x - b.x || a.y - b.y)[0];

export const townHasSupportStructureType = (
  tiles: ReadonlyMap<string, Tile>,
  town: Tile | undefined,
  ownerId: string | undefined,
  structureType: SupportTownStructureKey
): boolean => {
  if (!town || !ownerId) return false;
  const matchingTypes = SUPPORT_STRUCTURE_TYPES[structureType];
  // Scan only this town's own ring (its own tier's radius), not the wider
  // MAX_SUPPORT_RING_RADIUS -- we already know the anchor here, unlike
  // assignedTownForSupportTile above, which has to work backwards from an
  // arbitrary tile of unknown assignment.
  const radius = supportRingRadiusForTier(town.town?.populationTier);
  for (const { tile } of supportRingCandidates(tiles, town.x, town.y, radius)) {
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
    const assignedTown = assignedTownForSupportTile(tiles, tile, ownerId);
    if (!assignedTown || assignedTown.x !== town.x || assignedTown.y !== town.y) continue;
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== ownerId) continue;
    if (matchingTypes.includes(structure.type)) return true;
  }
  return false;
};
