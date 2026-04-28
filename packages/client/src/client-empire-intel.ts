import type { RevealEmpireStatsView } from "./client-types.js";

const formatInt = (value: number): string => Math.round(value).toLocaleString();

export const revealEmpireStatsSummaryLines = (stats: RevealEmpireStatsView | undefined): string[] => {
  if (!stats) return [];
  return [
    `Intel: ${stats.playerName}`,
    `Economy ${stats.incomePerMinute.toFixed(1)}/m • Gold ${formatInt(stats.gold)}`,
    `Territory ${formatInt(stats.tiles)} total • ${formatInt(stats.settledTiles)} settled • ${formatInt(stats.frontierTiles)} frontier`,
    `Towns ${formatInt(stats.controlledTowns)} • Tech ${formatInt(stats.techCount)}`,
    `Manpower ${formatInt(stats.manpower)}/${formatInt(stats.manpowerCap)}`,
    `Stockpiles F ${formatInt(stats.strategicResources.FOOD)} I ${formatInt(stats.strategicResources.IRON)} C ${formatInt(stats.strategicResources.CRYSTAL)} S ${formatInt(stats.strategicResources.SUPPLY)} Sh ${formatInt(stats.strategicResources.SHARD)} O ${formatInt(stats.strategicResources.OIL)}`
  ];
};

export const revealEmpireStatsFeedText = (stats: RevealEmpireStatsView): string =>
  `${stats.playerName}: ${stats.incomePerMinute.toFixed(1)}/m, ${formatInt(stats.tiles)} tiles, ${formatInt(stats.controlledTowns)} towns, ${formatInt(stats.gold)} gold.`;
