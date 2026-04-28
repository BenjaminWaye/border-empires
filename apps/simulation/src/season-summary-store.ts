import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import { createResilientPostgresPool } from "./postgres-pool.js";
import {
  buildSimulationSnapshotPayload,
  type SimulationSnapshotSections
} from "./snapshot-store.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type TransactionClient = Queryable & {
  release?: () => void;
};

type TransactionCapableQueryable = Queryable & {
  connect?: () => Promise<TransactionClient>;
};

type CurrentSummaryRow = {
  summary_json: CurrentSeasonSummary;
};

type ArchiveRow = {
  summary_json: SeasonArchiveRow;
};

const CURRENT_SUMMARY_KEY = "current";
const ACTIVE_SEASON_ID = "active";

export type SeasonSummaryStore = {
  saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void>;
  loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined>;
  listArchives(limit?: number): Promise<SeasonArchiveRow[]>;
  archiveSeason(summary: SeasonArchiveRow): Promise<void>;
  bootstrapSeason(options: {
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void>;
  startNextSeason(options: {
    archiveSummary: SeasonArchiveRow;
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void>;
};

export class InMemorySeasonSummaryStore implements SeasonSummaryStore {
  private currentSummary?: CurrentSeasonSummary;
  private archives: SeasonArchiveRow[] = [];

  async saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void> {
    this.currentSummary = JSON.parse(JSON.stringify(summary)) as CurrentSeasonSummary;
  }

  async loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined> {
    return this.currentSummary ? (JSON.parse(JSON.stringify(this.currentSummary)) as CurrentSeasonSummary) : undefined;
  }

  async listArchives(limit = 12): Promise<SeasonArchiveRow[]> {
    return this.archives.slice(0, limit).map((archive) => JSON.parse(JSON.stringify(archive)) as SeasonArchiveRow);
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    this.archives = [summary, ...this.archives.filter((archive) => archive.seasonId !== summary.seasonId)]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, 12);
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
    await this.archiveSeason(options.archiveSummary);
    await this.saveCurrentSummary(options.currentSummary);
  }
}

export class PostgresSeasonSummaryStore implements SeasonSummaryStore {
  constructor(private readonly db: TransactionCapableQueryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void> {
    await this.db.query(
      `
      INSERT INTO world_status_current (
        singleton_key,
        season_id,
        season_sequence,
        summary_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (singleton_key) DO UPDATE
      SET season_id = EXCLUDED.season_id,
          season_sequence = EXCLUDED.season_sequence,
          summary_json = EXCLUDED.summary_json,
          updated_at = EXCLUDED.updated_at
      `,
      [CURRENT_SUMMARY_KEY, summary.seasonId, summary.seasonSequence, JSON.stringify(summary), summary.updatedAt]
    );
  }

  async loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined> {
    const result = await this.db.query<CurrentSummaryRow>(
      `
      SELECT summary_json
      FROM world_status_current
      WHERE singleton_key = $1
      LIMIT 1
      `,
      [CURRENT_SUMMARY_KEY]
    );
    return result.rows[0]?.summary_json;
  }

  async listArchives(limit = 12): Promise<SeasonArchiveRow[]> {
    const result = await this.db.query<ArchiveRow>(
      `
      SELECT summary_json
      FROM season_archive
      ORDER BY ended_at DESC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows.map((row) => row.summary_json);
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    await this.db.query(
      `
      INSERT INTO season_archive (
        season_id,
        season_sequence,
        ended_at,
        summary_json,
        replay_events_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
      ON CONFLICT (season_id) DO UPDATE
      SET season_sequence = EXCLUDED.season_sequence,
          ended_at = EXCLUDED.ended_at,
          summary_json = EXCLUDED.summary_json,
          replay_events_json = EXCLUDED.replay_events_json,
          updated_at = EXCLUDED.updated_at
      `,
      [
        summary.seasonId,
        summary.seasonSequence,
        summary.endedAt,
        JSON.stringify(summary),
        JSON.stringify(summary.replayEvents),
        summary.updatedAt,
        summary.updatedAt
      ]
    );
    await this.db.query(
      `
      DELETE FROM season_archive
      WHERE season_id IN (
        SELECT season_id
        FROM season_archive
        ORDER BY ended_at DESC
        OFFSET 12
      )
      `
    );
  }

  async bootstrapSeason(options: {
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    const client = typeof this.db.connect === "function" ? await this.db.connect() : undefined;
    const db = client ?? this.db;
    await db.query("BEGIN");
    try {
      await this.writeOperationalReset(db);
      await this.insertSnapshot(db, options.snapshotSections, options.createdAt);
      await this.writeCurrentSummary(db, options.currentSummary);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      client?.release?.();
    }
  }

  async startNextSeason(options: {
    archiveSummary: SeasonArchiveRow;
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    const client = typeof this.db.connect === "function" ? await this.db.connect() : undefined;
    const db = client ?? this.db;
    await db.query("BEGIN");
    try {
      await this.writeArchive(db, options.archiveSummary);
      await this.writeOperationalReset(db);
      await this.insertSnapshot(db, options.snapshotSections, options.createdAt);
      await this.writeCurrentSummary(db, options.currentSummary);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      client?.release?.();
    }
  }

  private async writeArchive(db: Queryable, summary: SeasonArchiveRow): Promise<void> {
    await db.query(
      `
      INSERT INTO season_archive (
        season_id,
        season_sequence,
        ended_at,
        summary_json,
        replay_events_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
      ON CONFLICT (season_id) DO UPDATE
      SET season_sequence = EXCLUDED.season_sequence,
          ended_at = EXCLUDED.ended_at,
          summary_json = EXCLUDED.summary_json,
          replay_events_json = EXCLUDED.replay_events_json,
          updated_at = EXCLUDED.updated_at
      `,
      [
        summary.seasonId,
        summary.seasonSequence,
        summary.endedAt,
        JSON.stringify(summary),
        JSON.stringify(summary.replayEvents),
        summary.updatedAt,
        summary.updatedAt
      ]
    );
    await db.query(
      `
      DELETE FROM season_archive
      WHERE season_id IN (
        SELECT season_id
        FROM season_archive
        ORDER BY ended_at DESC
        OFFSET 12
      )
      `
    );
  }

  private async writeOperationalReset(db: Queryable): Promise<void> {
    await db.query("DELETE FROM command_results");
    await db.query("DELETE FROM commands");
    await db.query("DELETE FROM world_events");
    await db.query("DELETE FROM checkpoint_metadata");
    await db.query("DELETE FROM player_projection_current");
    await db.query("DELETE FROM tile_projection_current");
    await db.query("DELETE FROM combat_lock_projection_current");
    await db.query("DELETE FROM visibility_projection_current");
    await db.query("DELETE FROM world_status_current");
    await db.query("DELETE FROM world_snapshots");
  }

  private async insertSnapshot(
    db: Queryable,
    snapshotSections: SimulationSnapshotSections,
    createdAt: number
  ): Promise<void> {
    const payload = buildSimulationSnapshotPayload(snapshotSections);
    const result = await db.query<{ snapshot_id: number }>(
      `
      INSERT INTO world_snapshots (
        last_applied_event_id,
        snapshot_payload,
        created_at
      )
      VALUES ($1, $2::jsonb, $3)
      RETURNING snapshot_id
      `,
      [0, JSON.stringify(payload), createdAt]
    );
    const snapshotId = result.rows[0]?.snapshot_id;
    if (!snapshotId) throw new Error("bootstrap snapshot insert did not return snapshot_id");
    await db.query(
      `
      INSERT INTO checkpoint_metadata (
        season_id,
        current_snapshot_id,
        last_applied_event_id,
        last_compacted_event_id,
        checkpointed_at,
        updated_at
      )
      VALUES ($1, $2, 0, 0, $3, $3)
      `,
      [ACTIVE_SEASON_ID, snapshotId, createdAt]
    );
  }

  private async writeCurrentSummary(db: Queryable, summary: CurrentSeasonSummary): Promise<void> {
    await db.query(
      `
      INSERT INTO world_status_current (
        singleton_key,
        season_id,
        season_sequence,
        summary_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [CURRENT_SUMMARY_KEY, summary.seasonId, summary.seasonSequence, JSON.stringify(summary), summary.updatedAt]
    );
  }
}

export const createPostgresSeasonSummaryStore = (connectionString: string): PostgresSeasonSummaryStore =>
  new PostgresSeasonSummaryStore(
    createResilientPostgresPool(connectionString, "simulation-season-summary-store")
  );
