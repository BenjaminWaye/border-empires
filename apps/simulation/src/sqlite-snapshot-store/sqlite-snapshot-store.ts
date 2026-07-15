import type { DatabaseSync } from "node:sqlite";

import type { WorldStyle } from "@border-empires/shared";
import {
  buildSimulationSnapshotPayload,
  type SimulationSnapshotSections,
  type SimulationSnapshotStore,
  type StoredSimulationSnapshot
} from "../snapshot-store/snapshot-store.js";
import {
  compactSnapshotForStorage,
  expandSnapshotFromStorage,
  SNAPSHOT_FORMAT_VERSION,
  type RecoveredTile
} from "../snapshot-compaction/snapshot-compaction.js";
import {
  createChunkedSnapshotStringifier,
  type SnapshotStringifier
} from "../snapshot-stringifier/snapshot-stringifier.js";
import type { SnapshotCompactor } from "../snapshot-compaction-pool/snapshot-compaction-pool.js";

type Row = {
  snapshot_id: number;
  last_applied_event_id: number;
  snapshot_payload: string;
  created_at: number;
};

const defaultStringify: SnapshotStringifier = createChunkedSnapshotStringifier();

/**
 * Resolve the worldgen baseline tiles for a given (rulesetId, worldSeed).
 * Caller is responsible for memoisation — the store will not cache results.
 */
export type WorldgenBaselineResolver = (input: {
  rulesetId: string;
  worldSeed: number;
  mapStyle?: WorldStyle;
}) => Promise<ReadonlyArray<RecoveredTile>> | ReadonlyArray<RecoveredTile>;

export class SqliteSimulationSnapshotStore implements SimulationSnapshotStore {
  private readonly stringify: SnapshotStringifier;
  private readonly compact: SnapshotCompactor | undefined;
  private readonly resolveBaseline: WorldgenBaselineResolver | undefined;
  private readonly onPruneFailure: ((error: unknown) => void) | undefined;
  private lastLoadedFormatVersion: number | undefined;

  constructor(
    private readonly db: DatabaseSync,
    options: {
      stringify?: SnapshotStringifier;
      compact?: SnapshotCompactor;
      resolveBaseline?: WorldgenBaselineResolver;
      onPruneFailure?: (error: unknown) => void;
    } = {}
  ) {
    this.stringify = options.stringify ?? defaultStringify;
    this.compact = options.compact;
    this.resolveBaseline = options.resolveBaseline;
    this.onPruneFailure = options.onPruneFailure;
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

  async preparePayload(sections: SimulationSnapshotSections): Promise<string> {
    // With a worker compactor injected, resolve the raw baseline tiles only —
    // building the {x,y}->tile index (202,500 Map.set calls) happens inside
    // the worker too, so this thread never touches the full-world array.
    if (this.compact) {
      const baselineTiles = await this.resolveBaselineTilesFromSections(sections);
      const payload = baselineTiles
        ? await this.compact(sections, baselineTiles)
        : buildSimulationSnapshotPayload(sections);
      return await this.stringify(payload);
    }
    const baselineIndex = await this.resolveBaselineIndexFromSections(sections);
    const payload = baselineIndex
      ? await compactSnapshotForStorage(sections, baselineIndex)
      : buildSimulationSnapshotPayload(sections);
    return await this.stringify(payload);
  }

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
  }): Promise<void> {
    const json = await this.preparePayload(snapshot.snapshotSections);
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
    // CHUNKED to keep each contiguous SQLite write under ~half a second.
    // The single-DELETE form in PR #350 worked for steady-state pruning
    // (1k events between snapshots) but the first save after deploying
    // to a fat DB (~200k rows) ran the DELETE in one transaction. With
    // node:sqlite's writer pinned to the main thread, that translated to
    // multi-second event-loop blocks — `sim_event_store_write_ms` p99
    // jumped from sub-ms to 79ms (write-queue wait behind the prune),
    // `event_loop_blocked` lag samples crossed 16s, and a 30s spike
    // tripped the gateway watchdog and SIGKILLed prod 2h32m after the
    // PR #350 deploy. PRUNE_CHUNK rows per pass + setImmediate yield
    // between passes lets metric ticks, grpc dispatch, and command
    // append interleave between batches.
    //
    // NULL threshold (no snapshots yet on the very first save) — SQL
    // three-valued logic makes the WHERE clause false, the LIMIT
    // returns no rows, `result.changes` is 0, loop exits on first pass.
    //
    // Note this does not shrink the DB file. SQLite reuses freed pages
    // but the high-water mark only drops on VACUUM (separate one-off
    // maintenance). Future writes fit into the existing footprint, so
    // growth stops.
    //
    // Best-effort: the snapshot INSERT above already committed and is valid for
    // recovery. A corrupt world_events index (SQLITE_CORRUPT_INDEX) makes this
    // prune throw; if we let it propagate, the checkpoint manager never resets
    // pendingEvents and re-exports the whole world every few events forever
    // (the 2026-06-13 staging death-spiral). So swallow, count, and report —
    // the worst case is unpruned events, not data loss. Boot-time REINDEX
    // (sqlite-db.ts) is what actually repairs the underlying corruption.
    try {
      const PRUNE_CHUNK = 5000;
      const pruneStmt = this.db.prepare(
        `DELETE FROM world_events WHERE event_id IN (
           SELECT event_id FROM world_events
           WHERE event_id <= (SELECT MIN(last_applied_event_id) FROM world_snapshots)
           LIMIT ?
         )`
      );
      while (true) {
        const result = pruneStmt.run(PRUNE_CHUNK);
        if (!result.changes) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
    } catch (pruneError) {
      this.onPruneFailure?.(pruneError);
    }
  }

  private async resolveBaselineTilesFromSections(
    sections: SimulationSnapshotSections
  ): Promise<ReadonlyArray<RecoveredTile> | undefined> {
    if (!this.resolveBaseline) return undefined;
    const season = sections.initialState.season;
    if (!season) return undefined;
    return await this.resolveBaseline({
      rulesetId: season.rulesetId,
      worldSeed: season.worldSeed,
      ...(season.mapStyle ? { mapStyle: season.mapStyle } : {})
    });
  }

  private async resolveBaselineIndexFromSections(
    sections: SimulationSnapshotSections
  ): Promise<ReadonlyMap<string, RecoveredTile> | undefined> {
    const tiles = await this.resolveBaselineTilesFromSections(sections);
    if (!tiles) return undefined;
    const index = new Map<string, RecoveredTile>();
    for (const tile of tiles) index.set(`${tile.x},${tile.y}`, tile);
    return index;
  }

  private async resolveBaselineForLoadedPayload(parsed: unknown): Promise<ReadonlyArray<RecoveredTile> | undefined> {
    if (!this.resolveBaseline) return undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    const formatVersion = (parsed as { formatVersion?: unknown }).formatVersion;
    if (formatVersion !== SNAPSHOT_FORMAT_VERSION) return undefined;
    const season = (parsed as { season?: { rulesetId?: unknown; worldSeed?: unknown; mapStyle?: unknown } }).season;
    if (!season || typeof season.rulesetId !== "string" || typeof season.worldSeed !== "number") {
      return undefined;
    }
    const mapStyle = season.mapStyle === "islands" || season.mapStyle === "continents" ? season.mapStyle : undefined;
    return await this.resolveBaseline({
      rulesetId: season.rulesetId,
      worldSeed: season.worldSeed,
      ...(mapStyle ? { mapStyle } : {})
    });
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
    const baseline = await this.resolveBaselineForLoadedPayload(parsed);
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
