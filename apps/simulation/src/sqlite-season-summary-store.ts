import type { DatabaseSync } from "node:sqlite";
import type { CurrentSeasonSummary, SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";

import type { PersistedActivityLogs } from "./activity-dashboard/activity-log-persistence.js";
import type { DeadliestTileEntry } from "./deadliest-tiles/deadliest-tiles.js";
import type { SeasonSummaryStore } from "./season-summary-store.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";

const CURRENT_KEY = "current";

type CurrentRow = { summary_json: string };
type ArchiveRow = { summary_json: string };
type DeadliestTilesRow = { tiles_json: string };
type ActivityLogsRow = { logs_json: string };

export class SqliteSeasonSummaryStore implements SeasonSummaryStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_status_current (
        singleton_key TEXT PRIMARY KEY,
        season_id TEXT NOT NULL,
        season_sequence INTEGER NOT NULL,
        summary_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS season_archive (
        season_id TEXT PRIMARY KEY,
        season_sequence INTEGER NOT NULL,
        summary_json TEXT NOT NULL,
        ended_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS season_archive_ended_at_idx ON season_archive (ended_at DESC);
      -- One row per (season, player) holding that player's full-leaderboard
      -- rank/score/tiles/income/techs at season end -- unlike season_archive's
      -- summary_json, which only keeps a top-5 per category. Backs career
      -- stats (seasons played, best rank) on the player profile.
      CREATE TABLE IF NOT EXISTS season_participation (
        season_id TEXT NOT NULL,
        season_sequence INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        rank INTEGER NOT NULL,
        score REAL NOT NULL,
        tiles REAL NOT NULL,
        income_per_minute REAL NOT NULL,
        techs INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        PRIMARY KEY (season_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS season_participation_player_idx ON season_participation (player_id, ended_at DESC);
      -- One row per season holding a bounded top-K of per-tile combat damage
      -- (see deadliest-tiles.ts). Stored as a single JSON blob rather than a
      -- row per tile so a persist is one upsert on the summary's existing
      -- cadence, not K writes; season_id keys it so a rollover cannot bleed
      -- the previous season's totals into the new one.
      CREATE TABLE IF NOT EXISTS season_deadliest_tiles (
        season_id TEXT PRIMARY KEY,
        tiles_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      -- One row per season holding a bounded tail of the rolling 24h activity
      -- feeds (see activity-log-persistence.ts), so a restart does not reset
      -- the activity dashboard's "today". Same single-blob-upsert rationale as
      -- season_deadliest_tiles above.
      CREATE TABLE IF NOT EXISTS season_activity_logs (
        season_id TEXT PRIMARY KEY,
        logs_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  async saveActivityLogs(seasonId: string, logs: PersistedActivityLogs): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO season_activity_logs (season_id, logs_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET
           logs_json = excluded.logs_json,
           updated_at = excluded.updated_at`
      )
      .run(seasonId, JSON.stringify(logs), Date.now());
  }

  async loadActivityLogs(seasonId: string): Promise<PersistedActivityLogs | undefined> {
    const row = this.db
      .prepare(`SELECT logs_json FROM season_activity_logs WHERE season_id = ? LIMIT 1`)
      .get(seasonId) as ActivityLogsRow | undefined;
    if (!row) return undefined;
    const parsed = JSON.parse(row.logs_json) as Partial<PersistedActivityLogs>;
    if (!Array.isArray(parsed.flips) || !Array.isArray(parsed.combat)) return undefined;
    return { flips: parsed.flips, combat: parsed.combat };
  }

  async saveDeadliestTiles(seasonId: string, tiles: readonly DeadliestTileEntry[]): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO season_deadliest_tiles (season_id, tiles_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET
           tiles_json = excluded.tiles_json,
           updated_at = excluded.updated_at`
      )
      .run(seasonId, JSON.stringify(tiles), Date.now());
  }

  async loadDeadliestTiles(seasonId: string): Promise<DeadliestTileEntry[] | undefined> {
    const row = this.db
      .prepare(`SELECT tiles_json FROM season_deadliest_tiles WHERE season_id = ? LIMIT 1`)
      .get(seasonId) as DeadliestTilesRow | undefined;
    if (!row) return undefined;
    const parsed: unknown = JSON.parse(row.tiles_json);
    return Array.isArray(parsed) ? (parsed as DeadliestTileEntry[]) : undefined;
  }

  async saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO world_status_current (singleton_key, season_id, season_sequence, summary_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(singleton_key) DO UPDATE SET
           season_id = excluded.season_id,
           season_sequence = excluded.season_sequence,
           summary_json = excluded.summary_json,
           updated_at = excluded.updated_at`
      )
      .run(CURRENT_KEY, summary.seasonId, summary.seasonSequence, JSON.stringify(summary), summary.updatedAt);
  }

  async loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined> {
    const row = this.db
      .prepare(`SELECT summary_json FROM world_status_current WHERE singleton_key = ? LIMIT 1`)
      .get(CURRENT_KEY) as CurrentRow | undefined;
    return row ? (JSON.parse(row.summary_json) as CurrentSeasonSummary) : undefined;
  }

  async listArchives(limit = 12): Promise<SeasonArchiveRow[]> {
    const rows = this.db
      .prepare(`SELECT summary_json FROM season_archive ORDER BY ended_at DESC LIMIT ?`)
      .all(limit) as ArchiveRow[];
    return rows.map((row) => JSON.parse(row.summary_json) as SeasonArchiveRow);
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO season_archive (season_id, season_sequence, summary_json, ended_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(season_id) DO UPDATE SET
           season_sequence = excluded.season_sequence,
           summary_json = excluded.summary_json,
           ended_at = excluded.ended_at`
      )
      .run(summary.seasonId, summary.seasonSequence, JSON.stringify(summary), summary.endedAt);
  }

  async recordSeasonParticipation(seasonId: string, seasonSequence: number, endedAt: number, overall: CurrentSeasonSummary["overall"]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO season_participation (season_id, season_sequence, player_id, player_name, rank, score, tiles, income_per_minute, techs, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(season_id, player_id) DO UPDATE SET
         season_sequence = excluded.season_sequence,
         player_name = excluded.player_name,
         rank = excluded.rank,
         score = excluded.score,
         tiles = excluded.tiles,
         income_per_minute = excluded.income_per_minute,
         techs = excluded.techs,
         ended_at = excluded.ended_at`
    );
    for (const entry of overall) {
      stmt.run(seasonId, seasonSequence, entry.id, entry.name, entry.rank, entry.score, entry.tiles, entry.incomePerMinute, entry.techs, endedAt);
    }
  }

  async listParticipationForPlayer(playerId: string, limit = 200): Promise<SeasonParticipationRow[]> {
    const rows = this.db
      .prepare(
        `SELECT season_id, season_sequence, player_id, player_name, rank, score, tiles, income_per_minute, techs, ended_at
         FROM season_participation WHERE player_id = ? ORDER BY ended_at DESC LIMIT ?`
      )
      .all(playerId, limit) as Array<{
        season_id: string; season_sequence: number; player_id: string; player_name: string;
        rank: number; score: number; tiles: number; income_per_minute: number; techs: number; ended_at: number;
      }>;
    return rows.map((row) => ({
      seasonId: row.season_id,
      seasonSequence: row.season_sequence,
      playerId: row.player_id,
      playerName: row.player_name,
      rank: row.rank,
      score: row.score,
      tiles: row.tiles,
      incomePerMinute: row.income_per_minute,
      techs: row.techs,
      endedAt: row.ended_at
    }));
  }

  async bootstrapSeason(options: {
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    void options.snapshotSections;
    void options.createdAt;
    await this.saveCurrentSummary(options.currentSummary);
  }

  async startNextSeason(options: {
    archiveSummary: SeasonArchiveRow;
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    void options.snapshotSections;
    void options.createdAt;
    this.db.exec("BEGIN");
    try {
      await this.archiveSeason(options.archiveSummary);
      await this.saveCurrentSummary(options.currentSummary);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
