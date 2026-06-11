# Bootstrap payload shrink — 2026-05-30

> Agent hand-off. Multi-PR sequence. Read all of it.

## Why

Prod world doubled in size since launch. Bootstrap snapshot is now
**512KB** (`gateway_snapshot_json_bytes: 512018`, **7759 tiles**, vs
~256KB / 4030 tiles yesterday). Phase 1's worker-thread stringify
masks the CPU cost on the gateway main loop, but:

- More bytes over the wire to clients
- Larger persisted snapshot rows in SQLite → faster DB bloat
- Longer client-side parse time on weak devices
- More work for the stringify worker (still bounded, but rising)

The original `docs/plans/2026-05-28-gateway-bootstrap-perf.md` plan
identified three redundant fields in the bootstrap. PR 433 shipped one
of them (`territoryTileKeys`). Two remain. This plan covers both as
two independent PRs.

## What's still bloating the payload

**Per-tile fields (4000+ tiles × every bootstrap):**
1. `yieldRate` / `yieldCap` — current rates, derivable from static yield
   tables + tile state on the client.
2. Static map metadata: `landBiome`, `regionType`, `clusterId`,
   `continentId` — never change for a season. Sending on every
   bootstrap is pure waste.

`yield` (the current buffer) is NOT derivable. It must stay.

## Goal

Cut bootstrap payload by 30–50% (target: <300KB) without losing client
functionality.

## Ship as 2 PRs, independent

### PR A — Drop `yieldRate` and `yieldCap` from per-tile snapshot

**Why first:** simplest, highest payload-byte reduction per LOC
changed. Stays inside the sim → gateway → client pipeline; no new
RPCs.

**What to change:**

1. **Sim side, `apps/simulation/src/runtime/runtime.ts:6477-6479`:**
   ```ts
   ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
   ...(yieldView?.yieldRate ? { yieldRate: yieldView.yieldRate } : {}),  // ← drop
   ...(yieldView?.yieldCap ? { yieldCap: yieldView.yieldCap } : {})       // ← drop
   ```
   Keep `yield`. Drop the other two.

2. **Find the consumer.** Grep `packages/client/src/` for `yieldRate`
   and `yieldCap`. They're likely used in the UI (resource bar,
   tile-detail panel). The client must derive them from:
   - `yield` (current accumulated)
   - tile.terrain + tile.resource + player.techIds → look up the
     base rate from a static yield table
   - tile.economicStructureJson → multiplier
   
   This derivation logic exists somewhere already on the sim side
   (probably in `tile-yield.ts` or similar). The client needs the
   equivalent.

3. **Client-side derivation:** if the static yield tables aren't
   already in the client, port them. Look for `tile-yield.ts`,
   `yield-rate.ts`, or similar in `apps/simulation/src/`. The math
   itself is deterministic.

4. **Audit gateway/sim internal uses:** the gateway may use
   `yieldRate` for input-to-state latency tracking or similar. Grep
   `apps/realtime-gateway/src/` and confirm.

**Validation:**
- Bootstrap payload should drop by 100–150KB.
- Client resource bar still shows correct production rate.
- Tile-detail panel still shows yield rate / cap correctly.
- Tests: `pnpm --filter @border-empires/client test` and
  `pnpm --filter @border-empires/simulation test`.

**Tradeoff:**
- Client now does small per-tile derivation. ~4000 lookups on
  bootstrap — sub-ms.
- Yield-table format is now a client/sim shared dependency. Worth
  putting in `packages/sim-protocol/` or a shared package to avoid
  drift.

---

### PR B — Move static map metadata to a one-time cached fetch

**Why second:** bigger architectural change (new RPC, client cache),
but saves another 80–120KB per bootstrap.

**What to change:**

1. **New sim gRPC method:** `GetSeasonTerrainMap(seasonId, worldSeed)`
   → returns `Map<tileKey, { landBiome, regionType, clusterId,
   continentId }>`. Doesn't include yield/ownership/anything
   mutable — only immutable map.

2. **Gateway endpoint:** new HTTP route or WS message type that
   proxies it. Probably easier as a WS message
   (`type: "TERRAIN_MAP_REQUEST"` → `type: "TERRAIN_MAP"` response).

3. **Strip fields from per-tile snapshot:**
   - `apps/simulation/src/runtime/runtime.ts:3520-ish` (the tile shape in
     exportState — find where landBiome/regionType/clusterId are
     emitted; they may come from a separate enrichment step).
   - Check `apps/simulation/src/live-snapshot-view/live-snapshot-view.ts` for the same
     fields in the tile payload type.

4. **Client side:**
   - Request `TERRAIN_MAP` on first connect after auth. Cache in
     `localStorage` keyed by `worldSeed`.
   - On subsequent connects: only refetch if `worldSeed` changed
     (season reset).
   - Apply the cached map to incoming tiles on bootstrap (merge static
     metadata into each tile).

**Validation:**
- Cache miss path (first connect): one extra roundtrip, but bootstrap
  payload smaller. Net should be neutral or faster.
- Cache hit path (returning player same season): 100KB+ shrink, no
  extra roundtrip.
- Season transition invalidates cache → first connect of new season
  is a cache miss.
- Verify `landBiome` / `regionType` still render correctly (the 3D
  view uses these heavily).

**Tradeoff:**
- New RPC + client cache layer = more state to manage.
- First-ever connect to a new season takes one extra roundtrip
  (~50ms loopback gRPC).
- Worth it because **returning sessions hit the cache** and that's
  the common case.

## Sequence note

PR A first (it's contained, low-risk). Get it in prod, measure the
payload drop. Then PR B (it's an architectural change with more
review surface).

Don't combine A + B. If B regresses, A still shipped the easy win.

## File-size discipline

`runtime.ts` is enormous (9000+ lines). **Do not add to its body.**
PR A: just deletes two lines (well, two ternary spreads). PR B:
all new logic in new files (`apps/simulation/src/terrain-map-rpc.ts`,
`packages/sim-protocol/src/terrain-map.ts`, client side cache file).

## Self-review checklist (each PR)

- [ ] Bootstrap payload size measured before and after (capture
      `gateway_snapshot_json_bytes` from staging logs).
- [ ] No client functionality regression (resource bar, tile-detail
      panel, 3D map terrain coloring).
- [ ] No new sim main-thread CPU cost (everything stays in the worker).
- [ ] PR body lists the measured byte savings.
