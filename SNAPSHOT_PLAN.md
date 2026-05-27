# Snapshot Serialization at 250k Tiles — Analysis & Plan

## Current code path

### Trigger: `snapshot-checkpoint-manager.ts`

`createSnapshotCheckpointManager` fires `flushSnapshot()` when `pendingEvents >= checkpointEveryEvents` (default: 5000). Every event write calls `onEventPersisted()` which increments the counter and may call `flushSnapshot()`.

### Serialization: `sqlite-snapshot-store.ts:saveSnapshot()`

1. `buildSimulationSnapshotPayload(sections)` — assembles `initialState` + `commandEvents`
2. **v1 compact path** (when `resolveBaseline` is wired in): `compactSnapshotForStorage()` from `snapshot-compaction.ts` — produces a `V1SnapshotPayload` containing only the *mutable overlay* (tiles that differ from the worldgen baseline)
3. `this.stringify(payload)` — either inline `JSON.stringify` or a worker-based stringifier (`snapshot-stringify-worker.ts`). The worker is spawned with `maxOldGenerationSizeMb: 96` by default to cap worker heap.
4. `db.prepare(INSERT INTO world_snapshots).run(json)` — synchronous SQLite write on the main thread
5. Retention: keeps the most recent 3 snapshots; pruned in 5000-row chunks with `setImmediate` yields between passes

### `exportSnapshotSections()` in `runtime.ts:2735`

This is called synchronously on the main thread before the stringify worker gets the payload. It:
- Spreads `this.tiles.values()` — full 200k-tile scan
- Maps each tile to a snapshot-shape object (conditional spreads)
- Sorts tiles by `(x, y)`
- Spreads `this.locksByTile`, `this.players`, etc.

### `snapshot-compaction.ts:compactSnapshotForStorage()`

When v1 is active, this takes the full `initialState.tiles` array (200k tiles) and:
- Iterates all tiles, comparing each against the worldgen baseline index
- Emits only the overlay entries (tiles that differ)
- Does NOT modify the baseline tiles at all

The full tile array (`[...this.tiles.values()]` in `exportSnapshotSections`) is still built and traversed before compaction filters it down. The intermediate 200k-element array is the main cost.

## Cost estimate at 250k tiles

| Phase | Cost at 250k tiles | Notes |
|---|---|---|
| `exportSnapshotSections()` | ~50–150ms CPU + ~100–300MB peak memory | Full tile spread + sort, on main thread |
| `compactSnapshotForStorage()` | ~20–50ms CPU | Iterates the 250k array, compares each to baseline |
| Overlay JSON (v1) | ~2–20MB typically | Only mutable/changed tiles. At 50% ownership, could be 125k tiles × ~200 bytes ≈ 25MB |
| `JSON.stringify()` (worker) | ~50–200ms CPU in worker thread | Worker memory: 96MB cap |
| SQLite write | ~5–20ms | Synchronous, blocks the worker but not the event loop |

**Primary risk**: `exportSnapshotSections()` runs on the main event loop thread and takes 50–150ms at 250k tiles. This is the same bottleneck that caused the 107MB / main-thread freeze on staging before v1 compaction was introduced (noted in `snapshot-compaction.ts` header). With v1 active, the JSON payload is small, but the *data preparation* before compaction still allocates a 250k-element array on the main thread.

## Proposed approaches

### Approach A — Streaming tile export (recommended)

**What**: Replace `[...this.tiles.values()].map(...).sort(...)` in `exportSnapshotSections()` with a generator that emits tile objects one at a time into the compaction pipeline, without building the intermediate array.

**Implementation**:
- `exportSnapshotSections()` returns a lazy iterable for tiles instead of an array
- `compactSnapshotForStorage()` accepts an `Iterable<tile>` and streams it directly to the overlay builder
- The `V1SnapshotPayload.tileOverlay` is assembled from the stream without holding all 200k tiles in memory simultaneously
- The sort (`(x, y)`) must be applied to the OVERLAY (typically 1–50k entries) rather than the full 200k tile array — the sort key can be applied after compaction, not before

**Risk**: Medium. Requires touching the interface between `exportSnapshotSections`, `compactSnapshotForStorage`, and the SQLite store. The sort invariant must be preserved for the overlay (determinism / snapshot roundtrip tests must still pass). Encirclement tests and restart-parity integration tests cover this path.

**Reward**: Eliminates the 250k intermediate array allocation. Main-thread pause drops from ~50–150ms to ~10–30ms (the compaction comparison loop).

### Approach B — Incremental/diff-based overlay maintenance

**What**: Instead of building the overlay from scratch on every checkpoint, maintain a `pendingOverlayByTileKey: Map<string, V1OverlayTile>` that is updated incrementally in `replaceTileState`. On checkpoint, serialize and clear this map.

**Implementation**:
- In `replaceTileState`, after updating `this.tiles`, compare the new tile to the worldgen baseline and update `pendingOverlayByTileKey`
- On checkpoint, `exportSnapshotSections()` reads from `pendingOverlayByTileKey` instead of scanning all tiles
- The worldgen baseline must be available in the runtime (currently it's in `SqliteSimulationSnapshotStore`)

**Risk**: High. The worldgen baseline is not available in the runtime today — it lives in the snapshot store and is only used at load/save time. Threading the baseline into the runtime and keeping it consistent with restart-replay would require careful integration. The incremental map also needs to handle the "tile was changed and then changed back" case (net-zero vs worldgen baseline).

**Reward**: If the baseline is correctly maintained, `exportSnapshotSections()` becomes O(changed tiles since last checkpoint) instead of O(all tiles). At steady state with 5000 events per checkpoint, this could be 500–1000 tile changes — dramatically smaller.

### Approach C — Compress snapshot JSON

**What**: Apply `gzip` compression to the JSON payload before writing to SQLite. Node.js `zlib.gzip` is ~2–3× faster than `JSON.stringify` for the same data volume.

**Implementation**:
- Store `BLOB NOT NULL` instead of `TEXT` in SQLite
- Add `gzip()` after `stringify()` in the worker (both offloaded from main thread)
- `loadLatestSnapshot()` decompresses before `JSON.parse`

**Risk**: Low (schema migration needed — add a `format_flags` column to distinguish compressed vs uncompressed rows). Existing snapshots load fine.

**Reward**: Reduces disk I/O (SQLite write time) by 60–80%. For the worker-stringifier path, the gzip runs in the worker thread and doesn't affect the main event loop. Does NOT reduce the main-thread cost of `exportSnapshotSections()`.

## Recommendation

**Ship Approach A first** (streaming tile export). It attacks the biggest risk — the main-thread pause — without requiring the baseline to live in the runtime. The implementation is bounded to `runtime.ts:exportSnapshotSections()` and `snapshot-compaction.ts:compactSnapshotForStorage()`. All existing snapshot roundtrip tests and the restart-parity integration test provide the correctness gate.

**Then Approach C** as a follow-up (cheap, low-risk, improves disk I/O).

**Approach B** is the long-term solution (O(delta) instead of O(all tiles)) but requires the baseline-in-runtime threading work to be done first and should be its own PR.

## File:line references

| Location | Description |
|---|---|
| `apps/simulation/src/runtime.ts:2735` | `exportSnapshotSections()` — full tile spread |
| `apps/simulation/src/snapshot-compaction.ts:80+` | `compactSnapshotForStorage()` — iterates the full tile array |
| `apps/simulation/src/snapshot-stringifier.ts` | Worker-based JSON.stringify |
| `apps/simulation/src/sqlite-snapshot-store.ts:65` | `saveSnapshot()` — calls stringify + SQLite insert |
| `apps/simulation/src/snapshot-checkpoint-manager.ts:51` | `checkpointEveryEvents` default (5000 events) |

## Status

ANALYZE ONLY — no implementation in this PR.
