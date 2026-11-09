// SQLite side of season-end ELO: the rating columns on season_participation,
// the per-season rating pass, and a one-shot backfill for seasons that ended
// before ratings existed. Kept out of sqlite-season-summary-store.ts so that
// store stays about summary/archive persistence.
import type { DatabaseSync } from "node:sqlite";

import { computeSeasonElo, type SeasonEloResult, type SeasonStanding } from "./season-elo.js";

type ColumnInfoRow = { name: string };
type StandingRow = { season_id: string; player_id: string; rank: number; ended_at: number };

/** Adds rating_before / rating_after to season_participation if missing. */
export const ensureSeasonEloColumns = (db: DatabaseSync): void => {
  const columns = new Set((db.prepare(`PRAGMA table_info(season_participation)`).all() as ColumnInfoRow[]).map((row) => row.name));
  if (!columns.has("rating_before")) db.exec(`ALTER TABLE season_participation ADD COLUMN rating_before REAL`);
  if (!columns.has("rating_after")) db.exec(`ALTER TABLE season_participation ADD COLUMN rating_after REAL`);
};

const writeRatings = (db: DatabaseSync, seasonId: string, ratings: Map<string, SeasonEloResult>): void => {
  const stmt = db.prepare(`UPDATE season_participation SET rating_before = ?, rating_after = ? WHERE season_id = ? AND player_id = ?`);
  for (const [playerId, rating] of ratings) stmt.run(rating.ratingBefore, rating.ratingAfter, seasonId, playerId);
};

/**
 * Rates one season from its final standings (the caller writes the rows
 * first). Each player's prior is their latest rating from a *different*
 * season that ended no later than this one, so re-rating the same season (a
 * retried rollover) yields the same numbers instead of compounding.
 */
export const rateSeason = (db: DatabaseSync, seasonId: string, endedAt: number, standings: readonly SeasonStanding[]): void => {
  const priorStmt = db.prepare(
    `SELECT rating_after FROM season_participation
     WHERE player_id = ? AND season_id != ? AND ended_at <= ? AND rating_after IS NOT NULL
     ORDER BY ended_at DESC LIMIT 1`
  );
  const ratings = computeSeasonElo(
    standings,
    (playerId) => (priorStmt.get(playerId, seasonId, endedAt) as { rating_after: number } | undefined)?.rating_after
  );
  writeRatings(db, seasonId, ratings);
};

/**
 * Replays every recorded season oldest-first when any row is unrated (i.e.
 * seasons that ended before this feature shipped), so existing players get a
 * rating reflecting their whole history rather than starting from scratch.
 * Runs once at boot; a no-op after the first pass. Returns seasons rated.
 */
export const backfillSeasonElo = (db: DatabaseSync): number => {
  try {
    return replayAllSeasons(db);
  } catch (error) {
    // Ratings are cosmetic career stats: a failed backfill must not take the
    // simulation down at boot. Rows stay unrated and the next boot retries.
    console.error("[sqlite-season-elo] season ELO backfill failed", error);
    return 0;
  }
};

const replayAllSeasons = (db: DatabaseSync): number => {
  const unrated = db.prepare(`SELECT 1 FROM season_participation WHERE rating_after IS NULL LIMIT 1`).get();
  if (!unrated) return 0;
  const rows = db
    .prepare(`SELECT season_id, player_id, rank, ended_at FROM season_participation ORDER BY ended_at ASC, season_id ASC`)
    .all() as StandingRow[];
  const seasons = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const bucket = seasons.get(row.season_id);
    if (bucket) bucket.push(row);
    else seasons.set(row.season_id, [row]);
  }
  const current = new Map<string, number>();
  db.exec("BEGIN");
  try {
    for (const [seasonId, standings] of seasons) {
      const ratings = computeSeasonElo(
        standings.map((row) => ({ playerId: row.player_id, rank: row.rank })),
        (playerId) => current.get(playerId)
      );
      for (const [playerId, rating] of ratings) current.set(playerId, rating.ratingAfter);
      writeRatings(db, seasonId, ratings);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return seasons.size;
};
