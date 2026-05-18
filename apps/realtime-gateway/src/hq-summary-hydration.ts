import type {
  CurrentSeasonSummary,
  LeaderboardMetricEntry,
  LeaderboardOverallEntry,
  SeasonArchiveRow
} from "@border-empires/sim-protocol";

import type { GatewayPlayerProfileStore } from "./player-profile-store.js";

type ProfileNameLookup = Map<string, string>;

const collectIds = (summary: CurrentSeasonSummary): Set<string> => {
  const ids = new Set<string>();
  const addEntries = (entries: Array<{ id: string }> | undefined): void => {
    if (!entries) return;
    for (const entry of entries) ids.add(entry.id);
  };
  const lb = summary.leaderboard;
  if (lb) {
    addEntries(lb.overall);
    addEntries(lb.byTiles);
    addEntries(lb.byIncome);
    addEntries(lb.byTechs);
    if (lb.selfOverall) ids.add(lb.selfOverall.id);
    if (lb.selfByTiles) ids.add(lb.selfByTiles.id);
    if (lb.selfByIncome) ids.add(lb.selfByIncome.id);
    if (lb.selfByTechs) ids.add(lb.selfByTechs.id);
  }
  addEntries(summary.overall);
  addEntries(summary.byTiles);
  addEntries(summary.byIncome);
  addEntries(summary.byTechs);
  if (summary.seasonWinner) ids.add(summary.seasonWinner.playerId);
  return ids;
};

const collectArchiveIds = (rows: SeasonArchiveRow[]): Set<string> => {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.winner) ids.add(row.winner.playerId);
    for (const entry of row.mostTerritory) ids.add(entry.playerId);
    for (const entry of row.mostPoints) ids.add(entry.playerId);
    for (const entry of row.longestSurvivalMs) ids.add(entry.playerId);
  }
  return ids;
};

const buildNameLookup = async (
  ids: Iterable<string>,
  profileStore: GatewayPlayerProfileStore
): Promise<ProfileNameLookup> => {
  const lookup: ProfileNameLookup = new Map();
  const profiles = await profileStore.getMany(ids);
  for (const profile of profiles) {
    const trimmed = profile.name?.trim();
    if (trimmed) lookup.set(profile.playerId, trimmed);
  }
  return lookup;
};

const overrideEntryName = <T extends { id: string; name: string }>(entry: T, lookup: ProfileNameLookup): T => {
  const name = lookup.get(entry.id);
  return name ? { ...entry, name } : entry;
};

const overrideEntryNames = <T extends { id: string; name: string }>(entries: T[], lookup: ProfileNameLookup): T[] =>
  entries.map((entry) => overrideEntryName(entry, lookup));

export const hydrateCurrentSeasonSummaryDisplayNames = async (
  summary: CurrentSeasonSummary,
  profileStore: GatewayPlayerProfileStore
): Promise<CurrentSeasonSummary> => {
  const lookup = await buildNameLookup(collectIds(summary), profileStore);
  if (lookup.size === 0) return summary;

  const overall: LeaderboardOverallEntry[] = overrideEntryNames(summary.leaderboard.overall, lookup);
  const byTiles: LeaderboardMetricEntry[] = overrideEntryNames(summary.leaderboard.byTiles, lookup);
  const byIncome: LeaderboardMetricEntry[] = overrideEntryNames(summary.leaderboard.byIncome, lookup);
  const byTechs: LeaderboardMetricEntry[] = overrideEntryNames(summary.leaderboard.byTechs, lookup);

  const leaderboard: CurrentSeasonSummary["leaderboard"] = {
    overall,
    byTiles,
    byIncome,
    byTechs,
    ...(summary.leaderboard.selfOverall
      ? { selfOverall: overrideEntryName(summary.leaderboard.selfOverall, lookup) }
      : {}),
    ...(summary.leaderboard.selfByTiles
      ? { selfByTiles: overrideEntryName(summary.leaderboard.selfByTiles, lookup) }
      : {}),
    ...(summary.leaderboard.selfByIncome
      ? { selfByIncome: overrideEntryName(summary.leaderboard.selfByIncome, lookup) }
      : {}),
    ...(summary.leaderboard.selfByTechs
      ? { selfByTechs: overrideEntryName(summary.leaderboard.selfByTechs, lookup) }
      : {})
  };

  const originalWinner = summary.seasonWinner;
  const seasonWinner = originalWinner
    ? (() => {
        const overriddenName = lookup.get(originalWinner.playerId);
        return overriddenName ? { ...originalWinner, playerName: overriddenName } : originalWinner;
      })()
    : undefined;

  return {
    ...summary,
    leaderboard,
    overall,
    byTiles,
    byIncome,
    byTechs,
    ...(seasonWinner ? { seasonWinner } : {})
  };
};

const overrideArchivePlayerNames = (
  entries: Array<{ playerId: string; playerName: string; value: number }>,
  lookup: ProfileNameLookup
): Array<{ playerId: string; playerName: string; value: number }> =>
  entries.map((entry) => {
    const name = lookup.get(entry.playerId);
    return name ? { ...entry, playerName: name } : entry;
  });

export const hydrateSeasonArchiveDisplayNames = async (
  rows: SeasonArchiveRow[],
  profileStore: GatewayPlayerProfileStore
): Promise<SeasonArchiveRow[]> => {
  if (rows.length === 0) return rows;
  const lookup = await buildNameLookup(collectArchiveIds(rows), profileStore);
  if (lookup.size === 0) return rows;
  return rows.map((row) => {
    const originalWinner = row.winner;
    const winner = originalWinner
      ? (() => {
          const overriddenName = lookup.get(originalWinner.playerId);
          return overriddenName ? { ...originalWinner, playerName: overriddenName } : originalWinner;
        })()
      : undefined;
    return {
      ...row,
      ...(winner ? { winner } : {}),
      mostTerritory: overrideArchivePlayerNames(row.mostTerritory, lookup),
      mostPoints: overrideArchivePlayerNames(row.mostPoints, lookup),
      longestSurvivalMs: overrideArchivePlayerNames(row.longestSurvivalMs, lookup)
    };
  });
};
