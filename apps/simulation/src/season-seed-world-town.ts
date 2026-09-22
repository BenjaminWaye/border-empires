import type { DomainTileState } from "@border-empires/game-domain";
import { POPULATION_MAX, POPULATION_TOWN_MIN, type TownDefinition } from "@border-empires/game-domain";
import type { TileKey, TownTerrainProfileId } from "@border-empires/shared";

export const createSettlementTown = (tileKeyValue: TileKey, townType: "MARKET" | "FARMING", terrainProfile: TownTerrainProfileId = "GRASS", coastal = false): TownDefinition => ({
  townId: `town-${tileKeyValue}`,
  tileKey: tileKeyValue,
  type: townType,
  population: 800,
  maxPopulation: POPULATION_MAX,
  connectedTownCount: 0,
  connectedTownBonus: 0,
  lastGrowthTickAt: 0,
  isSettlement: true,
  terrainProfile,
  ...(coastal ? { coastal: true } : {})
});

export const townPopulationTier = (town: TownDefinition): "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" => {
  if (town.isSettlement && town.population < 1_000) return "SETTLEMENT";
  if (town.population >= 5_000_000) return "METROPOLIS";
  if (town.population >= 1_000_000) return "GREAT_CITY";
  if (town.population >= 100_000) return "CITY";
  if (town.population >= POPULATION_TOWN_MIN) return "TOWN";
  return "SETTLEMENT";
};

export const townStateFromDefinition = (town: TownDefinition): NonNullable<DomainTileState["town"]> => ({
  ...(town.name ? { name: town.name } : {}),
  type: town.type,
  populationTier: townPopulationTier(town),
  population: town.population,
  maxPopulation: town.maxPopulation,
  connectedTownCount: town.connectedTownCount,
  connectedTownBonus: town.connectedTownBonus,
  ...(town.terrainProfile ? { terrainProfile: town.terrainProfile } : {}),
  ...(town.coastal ? { coastal: true } : {})
});
