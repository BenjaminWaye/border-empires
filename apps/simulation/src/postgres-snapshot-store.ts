import type { SimulationSnapshotSections, SimulationSnapshotStore, StoredSimulationSnapshot } from "./snapshot-store.js";
import { createResilientPostgresPool } from "./postgres-pool.js";
import { writeCurrentProjections, type ProjectionExportState } from "./postgres-projection-writer.js";

type QueryResultRow = Record<string, unknown>;

type Queryable = {
  query: <TRow extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: readonly unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number | null }>;
};

type SnapshotRow = {
  snapshot_id: number;
  last_applied_event_id: number;
  snapshot_payload: StoredSimulationSnapshot["snapshotPayload"];
  created_at: number;
};

const toStoredSimulationSnapshot = (row: SnapshotRow): StoredSimulationSnapshot => ({
  snapshotId: row.snapshot_id,
  lastAppliedEventId: row.last_applied_event_id,
  snapshotPayload: row.snapshot_payload,
  createdAt: row.created_at
});

const ACTIVE_SEASON_ID = "active";

export class PostgresSimulationSnapshotStore implements SimulationSnapshotStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
    /** When provided, projection tables are written alongside world_snapshots. */
    projectionState?: ProjectionExportState;
  }): Promise<void> {
    await this.db.query("BEGIN");
    try {
      const initialStateJson = JSON.stringify(snapshot.snapshotSections.initialState);
      const commandEventsJson = JSON.stringify(snapshot.snapshotSections.commandEvents);
      const result = await this.db.query<{ snapshot_id: number }>(
        `
        INSERT INTO world_snapshots (
          last_applied_event_id,
          snapshot_payload,
          created_at
        )
        VALUES (
          $1,
          jsonb_build_object(
            'initialState', $2::jsonb,
            'commandEvents', $3::jsonb
          ),
          $4
        )
        RETURNING snapshot_id
        `,
        [snapshot.lastAppliedEventId, initialStateJson, commandEventsJson, snapshot.createdAt]
      );
      const snapshotId = result.rows[0]?.snapshot_id;
      if (!snapshotId) throw new Error("snapshot insert did not return snapshot_id");

      if (snapshot.projectionState) {
        await writeCurrentProjections(
          this.db,
          snapshot.snapshotSections.initialState,
          snapshot.projectionState,
          snapshot.createdAt
        );
      }

      await this.db.query(
        `
        INSERT INTO checkpoint_metadata (
          season_id,
          current_snapshot_id,
          last_applied_event_id,
          last_compacted_event_id,
          checkpointed_at,
          updated_at
        )
        VALUES ($1, $2, $3, $3, $4, $4)
        ON CONFLICT (season_id) DO UPDATE
        SET current_snapshot_id = EXCLUDED.current_snapshot_id,
            last_applied_event_id = EXCLUDED.last_applied_event_id,
            last_compacted_event_id = EXCLUDED.last_compacted_event_id,
            checkpointed_at = EXCLUDED.checkpointed_at,
            updated_at = EXCLUDED.updated_at
        `,
        [ACTIVE_SEASON_ID, snapshotId, snapshot.lastAppliedEventId, snapshot.createdAt]
      );

      await this.db.query(
        `
        DELETE FROM world_snapshots
        WHERE snapshot_id <> $1
        `,
        [snapshotId]
      );
      await this.db.query(
        `
        DELETE FROM world_events
        WHERE event_id <= $1
        `,
        [snapshot.lastAppliedEventId]
      );
      await this.db.query("COMMIT");
    } catch (error) {
      await this.db.query("ROLLBACK");
      throw error;
    }
  }

  async loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
    try {
      const metadataResult = await this.db.query<{ current_snapshot_id: number }>(
        `
        SELECT current_snapshot_id
        FROM checkpoint_metadata
        WHERE season_id = $1
        LIMIT 1
        `,
        [ACTIVE_SEASON_ID]
      );
      const metadataSnapshotId = metadataResult.rows[0]?.current_snapshot_id;
      if (typeof metadataSnapshotId === "number") {
        const pointerResult = await this.db.query<SnapshotRow>(
          `
          SELECT snapshot_id, last_applied_event_id, snapshot_payload, created_at
          FROM world_snapshots
          WHERE snapshot_id = $1
          LIMIT 1
          `,
          [metadataSnapshotId]
        );
        if (pointerResult.rows[0]) return toStoredSimulationSnapshot(pointerResult.rows[0]);
      }
    } catch {
      // Older deployments may not have checkpoint_metadata yet; fallback query below.
    }

    const result = await this.db.query<SnapshotRow>(
      `
      SELECT snapshot_id, last_applied_event_id, snapshot_payload, created_at
      FROM world_snapshots
      ORDER BY snapshot_id DESC
      LIMIT 1
      `
    );
    return result.rows[0] ? toStoredSimulationSnapshot(result.rows[0]) : undefined;
  }
}

export const createPostgresSimulationSnapshotStore = (connectionString: string): PostgresSimulationSnapshotStore =>
  new PostgresSimulationSnapshotStore(
    createResilientPostgresPool(connectionString, "simulation-snapshot-store")
  );
