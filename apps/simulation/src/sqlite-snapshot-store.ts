import type { DatabaseSync } from "node:sqlite";

import {
  buildSimulationSnapshotPayload,
  type SimulationSnapshotSections,
  type SimulationSnapshotStore,
  type StoredSimulationSnapshot
} from "./snapshot-store.js";
import {
  compactSnapshotForStorage,
  expandSnapshotFromStorage,
  SNAPSHOT_FORMAT_VERSION,
  type RecoveredTile
} from "./snapshot-compaction.js";
import type { SnapshotStringifier } from "./snapshot-stringifier.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

type Row = {
  snapshot_id: number;
  last_applied_event_id: number;
  snapshot_payload: string;
  created_at: number;
};

const inlineStringify: SnapshotStringifier = async (payload) => JSON.stringify(payload);

/**
 * Resolve the worldgen baseline tiles for a given (rulesetId, worldSeed).
 * Caller is responsible for memoisation — the store will not cache results.
 */
export type WorldgenBaselineResolver = (input: {
  rulesetId: string;
  worldSeed: number;
}) => ReadonlyArray<RecoveredTile>;

export class SqliteSimulationSnapshotStore implements SimulationSnapshotStore {
  private readonly stringify: SnapshotStringifier;
  private readonly resolveBaseline: WorldgenBaselineResolver | undefined;
  private lastLoadedFormatVersion: number | undefined;

  constructor(
    private readonly db: DatabaseSync,
    options: { stringify?: SnapshotStringifier; resolveBaseline?: WorldgenBaselineResolver } = {}
  ) {
    this.stringify = options.stringify ?? inlineStringify;
    this.resolveBaseline = options.resolveBaseline;
  }

  /** Format version of the most recently loaded snapshot (undefined = none loaded yet, 0 = v0/legacy). */
  getLastLoadedFormatVersion(): number | undefined {
    return this.lastLoadedFormatVersion;
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
    const baselineIndex = this.resolveBaselineIndexFromSections(snapshot.snapshotSections);
    const payload = baselineIndex
      ? compactSnapshotForStorage(snapshot.snapshotSections, baselineIndex)
      : buildSimulationSnapshotPayload(snapshot.snapshotSections);
    // Stringify off the main thread when a worker stringifier is wired in;
    // for v1 compact snapshots the inline path is fast enough that we can
    // accept a brief main-thread pause when no worker is configured.
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
    // Prune events at or before the oldest retained snapshot's
    // last_applied_event_id. Recovery reads `loadEventsAfter(eventId)` —
    // i.e. event_id > snapshot.last_applied_event_id — so anything at or
    // below that point is dead weight regardless of which of the three
    // retained snapshots we replay from.
    //
    // Without this, world_events was append-only forever: the 2026-05-21
    // prod outage was a 901 MB DB on a 1 GB volume after 7 days of
    // unpruned accumulation. SQLite hit "database or disk is full" and
    // the sim exited cleanly with code 1 — the gateway event-loop
    // watchdog can't catch that because it's a voluntary exit, not a
    // stall.
    //
    // NULL on first save (no snapshots yet) is handled by SQL's
    // three-valued logic: `event_id <= NULL` evaluates to NULL → not
    // truthy → nothing deleted. Safe.
    //
    // Note this does not shrink the DB file. SQLite reuses freed pages
    // but the high-water mark only drops on VACUUM (separate one-off
    // maintenance). Future writes fit into the existing footprint, so
    // growth stops.
    this.db.exec(
      `DELETE FROM world_events
       WHERE event_id <= (SELECT MIN(last_applied_event_id) FROM world_snapshots)`
    );
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  private resolveBaselineIndexFromSections(
    sections: SimulationSnapshotSections
  ): ReadonlyMap<string, RecoveredTile> | undefined {
    if (!this.resolveBaseline) return undefined;
    const season = sections.initialState.season;
    if (!season) return undefined;
    const tiles = this.resolveBaseline({ rulesetId: season.rulesetId, worldSeed: season.worldSeed });
    const index = new Map<string, RecoveredTile>();
    for (const tile of tiles) index.set(`${tile.x},${tile.y}`, tile);
    return index;
  }

  private resolveBaselineForLoadedPayload(parsed: unknown): ReadonlyArray<RecoveredTile> | undefined {
    if (!this.resolveBaseline) return undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    const formatVersion = (parsed as { formatVersion?: unknown }).formatVersion;
    if (formatVersion !== SNAPSHOT_FORMAT_VERSION) return undefined;
    const season = (parsed as { season?: { rulesetId?: unknown; worldSeed?: unknown } }).season;
    if (!season || typeof season.rulesetId !== "string" || typeof season.worldSeed !== "number") {
      return undefined;
    }
    return this.resolveBaseline({ rulesetId: season.rulesetId, worldSeed: season.worldSeed });
  }

  async loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
    const row = this.db
      .prepare(
        `SELECT snapshot_id, last_applied_event_id, snapshot_payload, created_at
         FROM world_snapshots ORDER BY created_at DESC, snapshot_id DESC LIMIT 1`
      )
      .get() as Row | undefined;
    if (!row) return undefined;
    const parsed = JSON.parse(row.snapshot_payload);
    const observedFormatVersion =
      parsed && typeof parsed === "object" && typeof (parsed as { formatVersion?: unknown }).formatVersion === "number"
        ? (parsed as { formatVersion: number }).formatVersion
        : 0;
    this.lastLoadedFormatVersion = observedFormatVersion;
    // If the on-disk row is v1 (mutable-only overlay), rehydrate against the
    // worldgen baseline extracted from the snapshot's own season seed.
    const baseline = this.resolveBaselineForLoadedPayload(parsed);
    const snapshotPayload = baseline
      ? expandSnapshotFromStorage(parsed, baseline)
      : parsed;
    return {
      snapshotId: row.snapshot_id,
      lastAppliedEventId: row.last_applied_event_id,
      snapshotPayload,
      createdAt: row.created_at
    };
  }
}
