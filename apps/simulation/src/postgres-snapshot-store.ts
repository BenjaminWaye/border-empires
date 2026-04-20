import type { SimulationSnapshotSections, SimulationSnapshotStore, StoredSimulationSnapshot } from "./snapshot-store.js";
import { createResilientPostgresPool } from "./postgres-pool.js";

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

export class PostgresSimulationSnapshotStore implements SimulationSnapshotStore {
  constructor(private readonly db: Queryable) {}

  async applySchema(sql: string): Promise<void> {
    await this.db.query(sql);
  }

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
  }): Promise<void> {
    const initialStateJson = JSON.stringify(snapshot.snapshotSections.initialState);
    const commandEventsJson = JSON.stringify(snapshot.snapshotSections.commandEvents);
    await this.db.query(
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
      `,
      [snapshot.lastAppliedEventId, initialStateJson, commandEventsJson, snapshot.createdAt]
    );
  }

  async loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
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
