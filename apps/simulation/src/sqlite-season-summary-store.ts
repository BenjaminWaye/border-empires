import type { DatabaseSync } from "node:sqlite";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { SeasonSummaryStore } from "./season-summary-store.js";
import type { SimulationSnapshotSections } from "./snapshot-store.js";

const CURRENT_KEY = "current";

type CurrentRow = { summary_json: string };
type ArchiveRow = { summary_json: string };

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
    `);
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
