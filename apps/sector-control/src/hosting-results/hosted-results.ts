// The results of a hosted sector's contest, saved before its server is
// deleted (plan section 9, step 4; section 15, step 8d). They come from the
// sector server's public GET /hq/summary, which already carries what a
// rollover archives: the standings, and once a House is crowned the winner,
// House Charges and awards. A sector closed before anyone was crowned (idle,
// withdrawn, refunded) has standings only, marked as not finished.
//
// Player ids are the sector server's own, which for a member is their
// Firebase uid. hosted-results-publisher.ts sends members' places to the game
// gateway for their House profiles (owner decision Q4).
import type { DatabaseSync } from "node:sqlite";

export type HostedStanding = { playerId: string; name: string; rank: number; score: number; tiles: number };

export type ContestResults = {
  seasonId: string;
  /** The contest's state when the server was deleted: "ended" once crowned, otherwise still running. */
  status: string;
  startedAt?: number;
  endedAt?: number;
  /** True when a House was crowned: the contest finished. */
  crowned: boolean;
  standings: HostedStanding[];
  /** Winner, House Charges and awards as the server reported them, kept as JSON for the profile. */
  details: Record<string, unknown>;
};

export type HostedResultsRecord = ContestResults & { sectorId: string; savedAt: number };

/** More than any sector holds (AI Houses plus human places); a longer list is cut, not refused. */
const MAX_STANDINGS = 200;
/** Player ids and names are short; anything longer is not a real one. */
const MAX_ID_LENGTH = 100;
/**
 * The winner, charges and awards of one contest are a few kilobytes once the
 * score history is left out. If they are still larger, the awards and charges
 * are dropped before the standings would be: the standings are what is shown.
 */
const MAX_DETAILS_BYTES = 256 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const count = (value: unknown): number => Math.max(0, Math.round(finite(value) ?? 0));
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));

/** The winner without its score history: one series per House over the whole contest, far too large to keep and not shown. */
const winnerWithoutHistory = (winner: Record<string, unknown>): Record<string, unknown> => {
  const { scoreHistory: _history, ...rest } = winner;
  return rest;
};

/** Reads what is kept from a sector server's /hq/summary. Throws when it is not a contest summary. */
export const parseContestResults = (summary: unknown): ContestResults => {
  if (!isRecord(summary) || typeof summary.seasonId !== "string" || !Array.isArray(summary.overall)) {
    throw new Error("the sector server's summary has no contest in it");
  }
  const standings: HostedStanding[] = [];
  let dropped = Math.max(0, summary.overall.length - MAX_STANDINGS);
  for (const entry of summary.overall.slice(0, MAX_STANDINGS)) {
    const rank = isRecord(entry) ? finite(entry.rank) : undefined;
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > MAX_ID_LENGTH || typeof entry.name !== "string" || rank === undefined) {
      dropped += 1;
      continue;
    }
    standings.push({ playerId: entry.id, name: Array.from(entry.name).slice(0, MAX_ID_LENGTH).join(""), rank: count(rank), score: finite(entry.score) ?? 0, tiles: count(entry.tiles) });
  }
  const winner = isRecord(summary.seasonWinner) ? winnerWithoutHistory(summary.seasonWinner) : undefined;
  let details: Record<string, unknown> = {
    ...(winner ? { seasonWinner: winner } : {}),
    ...(summary.seasonHouseCharges !== undefined ? { seasonHouseCharges: summary.seasonHouseCharges } : {}),
    ...(summary.seasonAwards !== undefined ? { seasonAwards: summary.seasonAwards } : {}),
    ...(finite(summary.seasonSequence) !== undefined ? { seasonSequence: summary.seasonSequence } : {})
  };
  if (bytes(details) > MAX_DETAILS_BYTES) details = { ...(winner ? { seasonWinner: winner } : {}), trimmed: "awards and House Charges too large to keep" };
  if (bytes(details) > MAX_DETAILS_BYTES) details = { trimmed: "winner details too large to keep" };
  // A count of what was left out, as the persistence rules ask for every cap.
  if (dropped > 0) details.droppedStandings = dropped;
  const startedAt = finite(summary.startedAt);
  const endedAt = finite(summary.endedAt);
  return {
    seasonId: summary.seasonId.slice(0, MAX_ID_LENGTH),
    status: typeof summary.status === "string" ? summary.status.slice(0, 40) : "unknown",
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
    crowned: winner !== undefined,
    standings,
    details
  };
};

export interface HostedResultsStore {
  /**
   * Keeps a sector's results, replacing an unfinished copy (a later reading
   * of a contest still running). A crowned copy is final: false then, and it stays.
   */
  save(sectorId: string, results: ContestResults, now: number): boolean;
  get(sectorId: string): HostedResultsRecord | undefined;
  /** Any copy, finished or not. */
  has(sectorId: string): boolean;
  hasCrowned(sectorId: string): boolean;
  /** Records a failed reading; returns when the failures began. */
  noteFailure(sectorId: string, now: number): number;
  clearFailure(sectorId: string): void;
}

type ResultsRow = { sector_id: string; saved_at: number; season_id: string; status: string; started_at: number | null; ended_at: number | null; crowned: number; details_json: string };
type PlayerRow = { player_id: string; player_name: string; rank: number; score: number; tiles: number };

/** One row per sector in hosted_results and one per player in hosted_result_players (plan section 6). */
export class SqliteHostedResultsStore implements HostedResultsStore {
  constructor(private readonly db: DatabaseSync) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_results (
        sector_id TEXT PRIMARY KEY,
        saved_at INTEGER NOT NULL,
        season_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        crowned INTEGER NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_results_failures (
        sector_id TEXT PRIMARY KEY,
        first_failed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_result_players (
        sector_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        rank INTEGER NOT NULL,
        score REAL NOT NULL,
        tiles INTEGER NOT NULL,
        PRIMARY KEY (sector_id, player_id)
      );
    `);
  }

  save(sectorId: string, results: ContestResults, now: number): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare(`SELECT crowned FROM hosted_results WHERE sector_id = ?`).get(sectorId) as { crowned: number } | undefined;
      if (existing?.crowned === 1) {
        this.db.exec("COMMIT");
        return false;
      }
      this.db.prepare(`DELETE FROM hosted_result_players WHERE sector_id = ?`).run(sectorId);
      this.db
        .prepare(`INSERT OR REPLACE INTO hosted_results (sector_id, saved_at, season_id, status, started_at, ended_at, crowned, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sectorId, now, results.seasonId, results.status, results.startedAt ?? null, results.endedAt ?? null, results.crowned ? 1 : 0, JSON.stringify(results.details));
      const insert = this.db.prepare(`INSERT OR IGNORE INTO hosted_result_players (sector_id, player_id, player_name, rank, score, tiles) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const standing of results.standings) insert.run(sectorId, standing.playerId, standing.name, standing.rank, standing.score, standing.tiles);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  hasCrowned(sectorId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM hosted_results WHERE sector_id = ? AND crowned = 1`).get(sectorId) !== undefined;
  }

  noteFailure(sectorId: string, now: number): number {
    this.db.prepare(`INSERT OR IGNORE INTO hosted_results_failures (sector_id, first_failed_at) VALUES (?, ?)`).run(sectorId, now);
    const row = this.db.prepare(`SELECT first_failed_at FROM hosted_results_failures WHERE sector_id = ?`).get(sectorId) as { first_failed_at: number };
    return Number(row.first_failed_at);
  }

  clearFailure(sectorId: string): void {
    this.db.prepare(`DELETE FROM hosted_results_failures WHERE sector_id = ?`).run(sectorId);
  }

  get(sectorId: string): HostedResultsRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM hosted_results WHERE sector_id = ?`).get(sectorId) as ResultsRow | undefined;
    if (!row) return undefined;
    const players = this.db
      .prepare(`SELECT player_id, player_name, rank, score, tiles FROM hosted_result_players WHERE sector_id = ? ORDER BY rank, player_id`)
      .all(sectorId) as PlayerRow[];
    return {
      sectorId: row.sector_id,
      savedAt: Number(row.saved_at),
      seasonId: row.season_id,
      status: row.status,
      ...(row.started_at !== null ? { startedAt: Number(row.started_at) } : {}),
      ...(row.ended_at !== null ? { endedAt: Number(row.ended_at) } : {}),
      crowned: row.crowned === 1,
      standings: players.map((player) => ({ playerId: player.player_id, name: player.player_name, rank: Number(player.rank), score: Number(player.score), tiles: Number(player.tiles) })),
      details: JSON.parse(row.details_json) as Record<string, unknown>
    };
  }

  has(sectorId: string): boolean {
    return this.db.prepare(`SELECT 1 FROM hosted_results WHERE sector_id = ?`).get(sectorId) !== undefined;
  }
}
