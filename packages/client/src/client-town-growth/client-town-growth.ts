import type { Tile } from "../client-types.js";

export const populationPerMinuteLabel = (deltaPerMinute: number): string => {
  const abs = Math.abs(deltaPerMinute);
  const sign = deltaPerMinute > 0 ? "+" : deltaPerMinute < 0 ? "-" : "";
  if (abs >= 100) return `${sign}${Math.round(abs).toLocaleString()}/m`;
  if (abs >= 10) return `${sign}${abs.toFixed(1)}/m`;
  return `${sign}${abs.toFixed(2)}/m`;
};

export const displayTownPopulationTierLabel = (populationTier: NonNullable<NonNullable<Tile["town"]>["populationTier"]>): string =>
  populationTier === "METROPOLIS" ? "Monumental City" : populationTier === "GREAT_CITY" ? "Great City" : populationTier === "SETTLEMENT" ? "Settlement" : populationTier === "TOWN" ? "Town" : "City";

export const townNextPopulationMilestone = (
  town: NonNullable<Tile["town"]>
): { label: string; targetPopulation: number } | undefined => {
  if (town.populationTier === "SETTLEMENT") return { label: "Town", targetPopulation: 10_000 };
  if (town.populationTier === "TOWN") return { label: "City", targetPopulation: 100_000 };
  if (town.populationTier === "CITY") return { label: "Great City", targetPopulation: 1_000_000 };
  if (town.populationTier === "GREAT_CITY") return { label: "Monumental City", targetPopulation: 5_000_000 };
  return undefined;
};

export const formatRoughMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) return "now";
  if (minutes < 60) return `${Math.ceil(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.ceil(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.ceil(days)}d`;
  const weeks = days / 7;
  return `${Math.ceil(weeks)}w`;
};

const townGrowthPauseReason = (
  town: NonNullable<Tile["town"]>,
  options?: { explainUnfed?: boolean }
): string | undefined => {
  const blockingModifier = town.growthModifiers?.find((modifier) => modifier.deltaPerMinute < 0)?.label;
  if (blockingModifier === "Recently captured") return "recently captured";
  if (blockingModifier === "Nearby war") return "nearby war";
  if (options?.explainUnfed && town.isFed === false) return "town is unfed";
  if (town.population >= town.maxPopulation) return "population cap reached";
  return undefined;
};

export const isTownGrowthPaused = (
  town: NonNullable<Tile["town"]>,
  options?: { explainUnfed?: boolean }
): boolean => {
  if (town.growthModifiers?.some((modifier) => modifier.deltaPerMinute < 0)) return true;
  if (options?.explainUnfed && town.isFed === false) return true;
  return (town.populationGrowthPerMinute ?? 0) <= 0;
};

export const shouldShowTownSmoke = (tile: Tile): boolean => {
  const town = tile.town;
  if (!town) return false;
  if (!tile.ownerId) return false;
  if (tile.terrain !== "LAND") return false;
  if (tile.ownershipState !== "SETTLED") return false;
  if (town.isFed === false) return false;
  return !isTownGrowthPaused(town);
};

// Mirror of the "Town is unfed" line in client-tile-menu-view.ts. The 2D and
// 3D map badges must only paint when the tile-menu would also show the
// unfed warning — otherwise neutral, foreign, or unsettled towns light up
// the map even though clicking them shows no fed/unfed info.
export const shouldShowTownUnfedWarning = (tile: Tile): boolean => {
  const town = tile.town;
  if (!town) return false;
  if (!tile.ownerId) return false;
  if (tile.terrain !== "LAND") return false;
  if (tile.ownershipState !== "SETTLED") return false;
  if (town.populationTier === "SETTLEMENT") return false;
  if (typeof town.isFed !== "boolean") return false;
  if (town.isFed) return false;
  if ((town.goldPerMinute ?? 0) > 0.001) return false;
  if ((town.populationGrowthPerMinute ?? 0) > 0.001) return false;
  return true;
};

export const townNextGrowthEtaLabel = (
  town: NonNullable<Tile["town"]>,
  options?: { explainUnfed?: boolean }
): string => {
  const milestone = townNextPopulationMilestone(town);
  if (!milestone) return "Max tier reached";
  const growth = town.populationGrowthPerMinute ?? 0;
  if (isTownGrowthPaused(town, options)) {
    const pauseReason = townGrowthPauseReason(town, options);
    return pauseReason ? `${milestone.label} growth paused (${pauseReason})` : `${milestone.label} growth paused`;
  }
  const remainingPopulation = Math.max(0, milestone.targetPopulation - town.population);
  if (remainingPopulation <= 0) return `${milestone.label} ready`;
  return `${milestone.label} in ~${formatRoughMinutes(remainingPopulation / growth)}`;
};
