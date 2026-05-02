import type { Tile } from "./client-types.js";

type TownPopulationTier = NonNullable<NonNullable<Tile["town"]>["populationTier"]>;

export const estimatedTownPopulationFloor = (populationTier: TownPopulationTier): number =>
  populationTier === "METROPOLIS" ? 5_000_000
    : populationTier === "GREAT_CITY" ? 1_000_000
      : populationTier === "CITY" ? 100_000
        : populationTier === "TOWN" ? 10_000
          : 3_000;

export const estimatedTownPopulationCap = (populationTier: TownPopulationTier): number =>
  populationTier === "SETTLEMENT" ? 10_000
    : populationTier === "TOWN" ? 100_000
      : populationTier === "CITY" ? 1_000_000
        : populationTier === "GREAT_CITY" ? 5_000_000
          : 10_000_000;
