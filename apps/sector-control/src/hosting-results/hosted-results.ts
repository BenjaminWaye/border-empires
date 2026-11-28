// The results of a hosted sector's contest, saved before its server is
// deleted (plan section 9, step 4; section 15, step 8d). They come from the
// sector server's public GET /hq/summary, which already carries what a
// rollover archives: the standings, and once a House is crowned the winner,
// House Charges and awards. A sector closed before anyone was crowned (idle,
// withdrawn, refunded) has standings only, marked as not finished.
//
// Player ids are the sector server's own. Linking them to accounts for the
// profile (owner decision Q4) is later work (plan section 16).
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
/** The winner, charges and awards of one contest are a few kilobytes; anything far larger is not stored. */
const MAX_DETAILS_BYTES = 256 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

/** Reads what is kept from a sector server's /hq/summary. Throws when it is not a contest summary. */
export const parseContestResults = (summary: unknown): ContestResults => {
  if (!isRecord(summary) || typeof summary.seasonId !== "string" || !Array.isArray(summary.overall)) {
    throw new Error("the sector server's summary has no contest in it");
  }
  const standings: HostedStanding[] = [];
  for (const entry of summary.overall.slice(0, MAX_STANDINGS)) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    const rank = finite(entry.rank);
    if (rank === undefined) continue;
    standings.push({ playerId: entry.id, name: entry.name.slice(0, 100), rank, score: finite(entry.score) ?? 0, tiles: finite(entry.tiles) ?? 0 });
  }
  const details: Record<string, unknown> = {};
  for (const key of ["seasonWinner", "seasonHouseCharges", "seasonAwards", "seasonSequence"] as const) {
    if (summary[key] !== undefined) details[key] = summary[key];
  }
  if (Buffer.byteLength(JSON.stringify(details)) > MAX_DETAILS_BYTES) throw new Error("the sector server's summary is too large to keep");
  const startedAt = finite(summary.startedAt);
  const endedAt = finite(summary.endedAt);
  return {
    seasonId: summary.seasonId.slice(0, 100),
    status: typeof summary.status === "string" ? summary.status.slice(0, 40) : "unknown",
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
    crowned: isRecord(summary.seasonWinner),
    standings,
    details
  };
};

export interface HostedResultsStore {
  /** Keeps a sector's results. False when they were saved already: the first copy stays. */
  save(sectorId: string, results: ContestResults, now: number): boolean;
  get(sectorId: string): HostedResultsRecord | undefined;
  has(sectorId: string): boolean;
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
    if (this.has(sectorId)) return false;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`INSERT INTO hosted_results (sector_id, saved_at, season_id, status, started_at, ended_at, crowned, details_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
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

  get(sectorId: string): HostedResultsRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM hosted_results WHERE sector_id = ?`).get(sectorId) as ResultsRow | undefined;
    if (!row) return undefined;
    const players = this.db
      .prepare(`SELECT player_id, player_name, rank, score, tiles FROM hosted_result_players WHERE sector_id = ? ORDER BY rank`)
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
