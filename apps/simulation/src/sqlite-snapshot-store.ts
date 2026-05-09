import type { DatabaseSync } from "node:sqlite";

import {
  buildSimulationSnapshotPayload,
  type SimulationSnapshotSections,
  type SimulationSnapshotStore,
  type StoredSimulationSnapshot
} from "./snapshot-store.js";
import type { SnapshotStringifier } from "./snapshot-stringifier.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

type Row = {
  snapshot_id: number;
  last_applied_event_id: number;
  snapshot_payload: string;
  created_at: number;
};

const inlineStringify: SnapshotStringifier = async (payload) => JSON.stringify(payload);

export class SqliteSimulationSnapshotStore implements SimulationSnapshotStore {
  private readonly stringify: SnapshotStringifier;

  constructor(
    private readonly db: DatabaseSync,
    options: { stringify?: SnapshotStringifier } = {}
  ) {
    this.stringify = options.stringify ?? inlineStringify;
  }

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
    // Stringify off the main thread when a worker stringifier is wired in;
    // a full snapshot is ~18MB on staging and inline JSON.stringify blocks
    // the simulation event loop long enough to break new player auth.
    const json = await this.stringify(payload);
    this.db
      .prepare(
        `INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at) VALUES (?, ?, ?)`
      )
      .run(snapshot.lastAppliedEventId, json, snapshot.createdAt);
    // Retention: keep only the most recent 3 snapshots. Each is a full
    // world dump, so unbounded retention fills the volume in hours.
    this.db.exec(
      `DELETE FROM world_snapshots WHERE snapshot_id NOT IN (
         SELECT snapshot_id FROM world_snapshots ORDER BY snapshot_id DESC LIMIT 3
       )`
    );
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
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
