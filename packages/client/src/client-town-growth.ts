import type { Tile } from "./client-types.js";

export const populationPerMinuteLabel = (deltaPerMinute: number): string => {
  const abs = Math.abs(deltaPerMinute);
  const sign = deltaPerMinute > 0 ? "+" : deltaPerMinute < 0 ? "-" : "";
  if (abs >= 100) return `${sign}${Math.round(abs).toLocaleString()}/m`;
  if (abs >= 10) return `${sign}${abs.toFixed(1)}/m`;
  return `${sign}${abs.toFixed(2)}/m`;
};

export const townNextPopulationMilestone = (
  town: NonNullable<Tile["town"]>
): { label: string; targetPopulation: number } | undefined => {
  if (town.populationTier === "SETTLEMENT") return { label: "Town", targetPopulation: 10_000 };
  if (town.populationTier === "TOWN") return { label: "City", targetPopulation: 100_000 };
  if (town.populationTier === "CITY") return { label: "Great City", targetPopulation: 1_000_000 };
  if (town.populationTier === "GREAT_CITY") return { label: "Metropolis", targetPopulation: 5_000_000 };
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

export const townNextGrowthEtaLabel = (town: NonNullable<Tile["town"]>): string => {
  const milestone = townNextPopulationMilestone(town);
  if (!milestone) return "Max tier reached";
  const growth = town.populationGrowthPerMinute ?? 0;
  if (growth <= 0) return `${milestone.label} growth paused`;
  const remainingPopulation = Math.max(0, milestone.targetPopulation - town.population);
  if (remainingPopulation <= 0) return `${milestone.label} ready`;
  return `${milestone.label} in ~${formatRoughMinutes(remainingPopulation / growth)}`;
};
