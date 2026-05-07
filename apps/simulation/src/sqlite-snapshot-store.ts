import type { DatabaseSync } from "node:sqlite";

import {
  buildSimulationSnapshotPayload,
  type SimulationSnapshotSections,
  type SimulationSnapshotStore,
  type StoredSimulationSnapshot
} from "./snapshot-store.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

type Row = {
  snapshot_id: number;
  last_applied_event_id: number;
  snapshot_payload: string;
  created_at: number;
};

export class SqliteSimulationSnapshotStore implements SimulationSnapshotStore {
  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS world_snapshots (
        snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
        last_applied_event_id INTEGER NOT NULL,
        snapshot_payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS world_snapshots_created_at_idx ON world_snapshots (created_at DESC);
    `);
  }

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
    projectionState?: ProjectionExportState;
  }): Promise<void> {
    const payload = buildSimulationSnapshotPayload(snapshot.snapshotSections);
    this.db
      .prepare(
        `INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at) VALUES (?, ?, ?)`
      )
      .run(snapshot.lastAppliedEventId, JSON.stringify(payload), snapshot.createdAt);
  }

  async loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
    const row = this.db
      .prepare(
        `SELECT snapshot_id, last_applied_event_id, snapshot_payload, created_at
         FROM world_snapshots ORDER BY created_at DESC, snapshot_id DESC LIMIT 1`
      )
      .get() as Row | undefined;
    if (!row) return undefined;
    return {
      snapshotId: row.snapshot_id,
      lastAppliedEventId: row.last_applied_event_id,
      snapshotPayload: JSON.parse(row.snapshot_payload),
      createdAt: row.created_at
    };
  }
}
