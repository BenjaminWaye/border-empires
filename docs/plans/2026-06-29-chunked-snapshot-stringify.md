# Chunked async snapshot stringify — 2026-06-29

> Phase 3c of the world-status/checkpoint EL-saturation line of work.
> Single PR. Sim-main-thread change only.

## Why

The snapshot checkpoint blocks the sim main thread ~2s on every flush.
Verified on staging (`event_loop_blocked lagMs: 2039`, queues empty,
`mainThreadTasks: []`). The block is **synchronous JSON serialization of
the whole world snapshot**, not persistence I/O (writes already route
through the sqlite writer worker).

Chain (sim main thread), fired from `persistenceQueue.onEventPersisted`
→ `snapshotCheckpointManager.onEventPersisted` → `flushSnapshot` every
`checkpointEveryEvents` (5000) persisted events:

1. `runtime.exportSnapshotSectionsAsync(yieldToEventLoop)` — already
   async/yielding. NOT the problem.
2. `WriterBackedSnapshotStore.saveSnapshot` → `reader.preparePayload`:
   - `compactSnapshotForStorage` / `buildSimulationSnapshotPayload` —
     sync build of one big payload object (iterates all tiles).
   - `this.stringify(payload)` where `stringify` defaults to
     `inlineStringify = async (p) => JSON.stringify(p)`. The `async` is
     cosmetic — `JSON.stringify` runs synchronously to completion and
     blocks the event loop for the entire world dump. **This is the 2s
     stall.** (`apps/simulation/src/sqlite-snapshot-store/sqlite-snapshot-store.ts:24`,
     used at `:76`.)
3. `channel.post({ op: "saveSnapshot", json, ... })` — async, fine.

### Why this is the 100-player bug, not an AI artifact

Checkpoints fire on **event volume**, independent of player type. 100
concurrent humans expanding produce the same event flood the 5 test AIs
do → checkpoints fire frequently → each freezes the loop ~2s →
auth/command RPCs miss the 2500ms gateway submit timeout →
`SIMULATION_UNAVAILABLE` → restart cycle. Removing the stall is required
for 100-player viability regardless of AI.

## Goal

The snapshot checkpoint must never block the sim event loop for more than
a small bounded slice (~target ≤ a few ms per slice). Serialization stays
on the sim thread but yields to the loop between chunks, mirroring the
existing `exportSnapshotSectionsAsync` and chunked-prune patterns.

## What changes

### 1. Chunked stringifier — `apps/simulation/src/sqlite-snapshot-store/sqlite-snapshot-store.ts`

The payload returned by `compactSnapshotForStorage` /
`buildSimulationSnapshotPayload` is a single object whose bulk is large
arrays (tiles dominate; also players/docks/anchors). Replace the
monolithic `JSON.stringify(payload)` with an incremental serializer that:

- Serializes top-level scalar/small fields normally.
- For the large array field(s), emits the JSON array by stringifying each
  element (or small batches of elements, e.g. 2000 at a time) and
  concatenating into a growing string (or string[] joined once at the
  end), calling `await yieldToEventLoop()` (or `await new Promise(r =>
  setImmediate(r))`) every batch.
- Produces a string **byte-identical** in structure to
  `JSON.stringify(payload)` for the same payload (round-trips through
  `JSON.parse` to the same object). Add a unit test asserting
  `JSON.parse(chunked) deep-equals payload` and that it equals
  `JSON.stringify(payload)` for a representative payload.

Implementation notes:
- Inject the yield function rather than hard-coding `setImmediate`, so
  tests can run it synchronously. The store already supports a
  `stringify?: SnapshotStringifier` option (`:44`, `:49`) — extend that
  seam: default to a chunked implementation that yields via
  `setImmediate`; tests can pass an immediate/no-yield variant.
- Identify the largest array field(s) by inspecting
  `SimulationSnapshotSections` / the output of
  `buildSimulationSnapshotPayload` and `compactSnapshotForStorage`
  (`apps/simulation/src/snapshot-payload/…` or wherever these live —
  grep for the definitions). Only the big arrays need chunking; small
  fields can be stringified whole.
- Keep `compactSnapshotForStorage` / `buildSimulationSnapshotPayload` as
  they are for now IF their synchronous build is < ~50ms at 200k tiles;
  if profiling/inspection shows that object build is itself a big
  sync cost, also yield inside payload construction. (Check: these
  iterate all tiles once. If they allocate a full parallel array, that
  build may also need chunking. Note this in the PR if so.)

### 2. Verify the seam reaches prod path

`WriterBackedSnapshotStore.saveSnapshot`
(`apps/simulation/src/sqlite-writer-channel/sqlite-writer-channel.ts:142`)
calls `this.reader.preparePayload(sections)` where `reader` is the
`SqliteSimulationSnapshotStore`. Confirm the chunked stringifier is the
default used by that reader in the combined/prod wiring
(`snapshot-store-factory.ts`). The fix must apply when `writerChannel` is
present (prod), not only the no-worker path.

### 3. Metric (optional but preferred)

Add a gauge `sim_snapshot_stringify_ms` recorded around `preparePayload`
so we can confirm post-deploy that the *total* serialize time is
unchanged (or only mildly higher) while the **per-slice** event-loop block
disappears. The existing `event_loop_blocked` diagnostic is the primary
success signal.

## What NOT to do

- Do not move serialization into the writer worker — the `postMessage`
  structured-clone of the sections is itself O(all tiles) and nearly as
  blocking. Rejected.
- Do not switch to delta/incremental snapshots — large design change,
  out of scope for this fix.
- Do not change `checkpointEveryEvents`, the memory guards, or the writer
  worker. The frequency is fine once each checkpoint is non-blocking.
- Do not touch the AI planner or the AI-skip `emitPlayerStateUpdate`
  change (already merged, staying in as a load reducer).

## Validation

- Unit: chunked stringify round-trips to the same object and equals
  `JSON.stringify` output for a representative + an empty + a
  single-element payload. Yield callback invoked > once for a large
  payload.
- Local: `pnpm --filter @border-empires/simulation build` clean (Docker
  tsc strictness: `noUncheckedIndexedAccess` etc).
- Staging: deploy, drive AI expansion load, scrape `flyctl logs` for
  `event_loop_blocked` — the periodic ~2s spikes tied to checkpoints
  must be gone. `simulation_submit_rpc_slow` p99 should drop below the
  2500ms gateway timeout. Login probe should stay healthy across a
  checkpoint window.
- Success = no `SIMULATION_UNAVAILABLE` cycle under sustained AI
  expansion for ≥10 min.

## Self-review checklist

- [ ] Chunked stringify is the default on the prod (`writerChannel`) path.
- [ ] Round-trip equality test passes.
- [ ] Yields are real (`setImmediate`/`yieldToEventLoop`), not just an
      `async` wrapper around a sync call.
- [ ] Build clean in a fresh checkout.
- [ ] PR body cites this plan + the event_loop_blocked staging evidence.
