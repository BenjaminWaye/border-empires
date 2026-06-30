import { POPULATION_MAX, POPULATION_TOWN_MIN, type DomainTileState } from "@border-empires/game-domain";
import { CITY_POPULATION_MIN, GREAT_CITY_POPULATION_MIN, METROPOLIS_POPULATION_MIN } from "@border-empires/shared";

const SYNTHETIC_SETTLEMENT_POPULATION = 800;

export const parseOptionalJson = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const isSyntheticSettlementIdentity = (
  town: Pick<NonNullable<DomainTileState["town"]>, "name" | "populationTier"> | undefined,
  x: number,
  y: number
): boolean => Boolean(town && town.populationTier === "SETTLEMENT" && town.name === `Settlement ${x},${y}`);

const minimumPopulationForTier = (populationTier: NonNullable<DomainTileState["town"]>["populationTier"]): number => {
  if (populationTier === "METROPOLIS") return METROPOLIS_POPULATION_MIN;
  if (populationTier === "GREAT_CITY") return GREAT_CITY_POPULATION_MIN;
  if (populationTier === "CITY") return CITY_POPULATION_MIN;
  if (populationTier === "TOWN") return POPULATION_TOWN_MIN;
  return SYNTHETIC_SETTLEMENT_POPULATION;
};

type TownType = NonNullable<DomainTileState["town"]>["type"];
type PopulationTier = NonNullable<DomainTileState["town"]>["populationTier"];

export const hydrateRecoveredTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): DomainTileState["town"] | undefined => {
  if (!town) return undefined;
  const defaultPopulation = isSyntheticSettlementIdentity(town, x, y)
    ? SYNTHETIC_SETTLEMENT_POPULATION
    : minimumPopulationForTier(town.populationTier);
  const population = typeof town.population === "number" ? town.population : defaultPopulation;
  const maxPopulation = typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX;
  return {
    ...town,
    population,
    maxPopulation
  };
};

export const recoverTownState = (
  tileDelta: {
    x: number;
    y: number;
    townJson?: string | undefined;
    townName?: string | undefined;
    townType?: string | undefined;
    townPopulationTier?: string | undefined;
  },
  existing?: { town?: DomainTileState["town"] }
): DomainTileState["town"] | undefined => {
  if ("townJson" in tileDelta && !tileDelta.townJson) {
    return undefined;
  }
  const parsedTown = parseOptionalJson<DomainTileState["town"]>(tileDelta.townJson);
  if (parsedTown) {
    return hydrateRecoveredTown({
      ...existing?.town,
      ...parsedTown,
      ...(tileDelta.townName ? { name: tileDelta.townName } : {}),
      type: (parsedTown.type ?? tileDelta.townType ?? existing?.town?.type ?? "FARMING") as TownType,
      populationTier: (parsedTown.populationTier ?? tileDelta.townPopulationTier ?? existing?.town?.populationTier ?? "SETTLEMENT") as PopulationTier
    }, tileDelta.x, tileDelta.y);
  }
  if (tileDelta.townName || tileDelta.townType || tileDelta.townPopulationTier) {
    return hydrateRecoveredTown({
      ...existing?.town,
      ...(tileDelta.townName ? { name: tileDelta.townName } : {}),
      type: (tileDelta.townType ?? existing?.town?.type ?? "FARMING") as TownType,
      populationTier: (tileDelta.townPopulationTier ?? existing?.town?.populationTier ?? "SETTLEMENT") as PopulationTier
    }, tileDelta.x, tileDelta.y);
  }
  return hydrateRecoveredTown(existing?.town, tileDelta.x, tileDelta.y);
};
