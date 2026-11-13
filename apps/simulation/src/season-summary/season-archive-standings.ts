import type { CurrentSeasonSummary, SeasonArchiveRow, SeasonArchiveStanding, SeasonParticipationRow } from "@border-empires/sim-protocol";

// Full final standings carried on SeasonArchiveRow so the client can reopen
// the season-end recap after the next contest starts (see the client's
// client-last-contest-recap). Written at archive time for new seasons;
// backfilled on read from season participation rows (which already hold the
// full leaderboard) for archives written before finalStandings existed.

export const standingsFromOverall = (overall: CurrentSeasonSummary["overall"]): SeasonArchiveStanding[] =>
  overall.map((entry) => ({
    id: entry.id,
    name: entry.name,
    rank: entry.rank,
    score: entry.score,
    tiles: entry.tiles,
    incomePerMinute: entry.incomePerMinute,
    techs: entry.techs
  }));

export const standingsFromParticipation = (rows: readonly SeasonParticipationRow[]): SeasonArchiveStanding[] =>
  [...rows]
    .sort((left, right) => left.rank - right.rank)
    .map((row) => ({
      id: row.playerId,
      name: row.playerName,
      rank: row.rank,
      score: row.score,
      tiles: row.tiles,
      incomePerMinute: row.incomePerMinute,
      techs: row.techs
    }));

/**
 * Backfills finalStandings on the newest archive only -- the one the recap
 * reopens. Older legacy rows are left alone so a list read stays one extra
 * query at most; every season archived from now on carries its own.
 */
export const withBackfilledLatestStandings = async (
  archives: SeasonArchiveRow[],
  loadParticipationForSeason: (seasonId: string) => Promise<SeasonParticipationRow[]>
): Promise<SeasonArchiveRow[]> => {
  const [latest, ...rest] = archives;
  if (!latest || latest.finalStandings) return archives;
  const rows = await loadParticipationForSeason(latest.seasonId);
  if (rows.length === 0) return archives;
  return [{ ...latest, finalStandings: standingsFromParticipation(rows) }, ...rest];
};
