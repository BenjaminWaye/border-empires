import type { DatabaseSync } from "node:sqlite";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

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
