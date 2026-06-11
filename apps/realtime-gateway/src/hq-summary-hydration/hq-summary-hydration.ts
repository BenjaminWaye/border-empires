import type {
  CurrentSeasonSummary,
  SeasonArchiveRow,
  SeasonVictoryObjectiveSnapshot
} from "@border-empires/sim-protocol";

import type { GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";

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
  for (const objective of summary.seasonVictory) {
    if (objective.leaderPlayerId) ids.add(objective.leaderPlayerId);
  }
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

const overrideWinnerName = <T extends { playerId: string; playerName: string }>(
  winner: T,
  lookup: ProfileNameLookup
): T => {
  const name = lookup.get(winner.playerId);
  return name ? { ...winner, playerName: name } : winner;
};

const overrideSeasonVictoryLeaderNames = (
  objectives: SeasonVictoryObjectiveSnapshot[],
  lookup: ProfileNameLookup
): SeasonVictoryObjectiveSnapshot[] =>
  objectives.map((objective) => {
    if (!objective.leaderPlayerId) return objective;
    const name = lookup.get(objective.leaderPlayerId);
    return name ? { ...objective, leaderName: name } : objective;
  });

export const hydrateCurrentSeasonSummaryDisplayNames = async (
  summary: CurrentSeasonSummary,
  profileStore: GatewayPlayerProfileStore
): Promise<CurrentSeasonSummary> => {
  const lookup = await buildNameLookup(collectIds(summary), profileStore);
  if (lookup.size === 0) return summary;

  const overall = overrideEntryNames(summary.leaderboard.overall, lookup);
  const byTiles = overrideEntryNames(summary.leaderboard.byTiles, lookup);
  const byIncome = overrideEntryNames(summary.leaderboard.byIncome, lookup);
  const byTechs = overrideEntryNames(summary.leaderboard.byTechs, lookup);

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

  const seasonWinner = summary.seasonWinner ? overrideWinnerName(summary.seasonWinner, lookup) : undefined;
  const seasonVictory = overrideSeasonVictoryLeaderNames(summary.seasonVictory, lookup);

  return {
    ...summary,
    leaderboard,
    overall,
    byTiles,
    byIncome,
    byTechs,
    seasonVictory,
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
    const winner = row.winner ? overrideWinnerName(row.winner, lookup) : undefined;
    return {
      ...row,
      ...(winner ? { winner } : {}),
      mostTerritory: overrideArchivePlayerNames(row.mostTerritory, lookup),
      mostPoints: overrideArchivePlayerNames(row.mostPoints, lookup),
      longestSurvivalMs: overrideArchivePlayerNames(row.longestSurvivalMs, lookup)
    };
  });
};
