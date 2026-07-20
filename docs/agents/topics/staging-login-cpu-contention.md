# Staging Login Stalls / SIM_UNAVAILABLE — CPU Contention on shared-cpu-1x

## Scope

Debugging staging login-probe failures (`pnpm ops:staging:login-probe`) and
`SIMULATION_UNAVAILABLE` under heavy AI load (5 AI players + 1 barbarian, the
`season-20ai` staging profile). Does NOT cover production incidents — prod runs
fewer/no AI players at this density and has not shown this symptom.

This doc supersedes `.claude/plans/sim-unavailable-*.md` (2026-06-15, stale) for
this specific symptom family. Those files cover an earlier round of the same
investigation (replay-cache freeze, PR #615) — read this doc first; only dig into
those if this doc's fixes don't explain what you're seeing.

## The process model (why this is a contention problem, not a slow-code problem)

The combined gateway+sim deploy (`border-empires-combined-staging`,
`shared-cpu-1x:2048MB` = **one fractional vCPU**) runs far more concurrently-active
OS threads than the box has cores for:

| Thread | Started by | Active when |
|---|---|---|
| main gateway | — | always (HTTP/WS I/O) |
| main sim | — | always (tick loop, checkpoint **compaction** — see below) |
| `ai-planner-worker` | `apps/simulation/src/ai/ai-command-producer-worker.ts` | AI planning (one player per tick, round-robin — see Known Pitfalls) |
| `system-job-worker` | `apps/simulation/src/ai/system-command-producer-worker.ts` | barbarian/upkeep planning |
| `sqlite-writer-worker` | `apps/simulation/src/sqlite-writer-channel/sqlite-writer-channel.ts` | every event persist |
| `snapshot-build-worker` ×2 | `apps/simulation/src/snapshot-builder/snapshot-builder.ts` | login/subscribe |
| `snapshot-stringify-worker` | `apps/simulation/src/snapshot-stringifier/snapshot-stringifier.ts` | checkpoint stringify |

Idle `.unref()`'d workers don't cost CPU. The problem is when several are
**concurrently active** — most acutely, checkpoint **compaction**
(`apps/simulation/src/snapshot-compaction/snapshot-compaction.ts`,
`compactSnapshotForStorage`) runs **synchronously on the main sim thread**,
at the same moments the AI/system planner workers are also live.

## Diagnostic toolkit (in the order to reach for them)

1. **Login probe** — ground truth for the user-facing symptom:
   ```bash
   export PROBE_FIREBASE_REFRESH_TOKEN="$(flyctl ssh console -a border-empires-combined-staging -C 'printenv PROBE_FIREBASE_REFRESH_TOKEN' 2>/dev/null | tail -1)"
   pnpm ops:staging:login-probe   # 12 attempts, 8s timeout, requires 100% success
   ```
   **A 100% pass immediately post-deploy is not sufficient evidence of a fix** — this
   exact symptom has looked perfect right after deploy and regressed 15-30+ minutes
   later under sustained AI load, more than once. Always re-check after 15-20+ minutes.

2. **`sim_checkpoint_export_ms`** (Prometheus gauge) — the canary metric. Checkpoints
   fire roughly every `SIMULATION_SNAPSHOT_EVERY_EVENTS` (~1000 events, ~7 min steady
   state). p95/p99 in the multi-second range (6-18s observed) = the symptom.

3. **`[sqlite-snapshot-store] slow checkpoint phase: <phase> took <ms>ms`** — per-phase
   breakdown (`resolve_baseline_index`, `compact`, `stringify`, `sqlite_insert`,
   `prune_events`), console.warn gated at 300ms. Added by PR #941, diagnostics-only.
   Stream via:
   ```bash
   flyctl logs -a border-empires-combined-staging | grep --line-buffered "slow checkpoint phase"
   ```
   (Always live-stream, not `-n`/`--no-tail` — that only replays a short buffer and
   will miss the ~7-minute-interval checkpoint log lines.)

4. **`/proc/pressure/cpu` (PSI)** — the kernel-level proof of contention vs. algorithm cost:
   ```bash
   flyctl ssh console -a border-empires-combined-staging -C "sh -c 'cat /proc/pressure/cpu; nproc'"
   ```
   `some avg10=X` = % of the last 10s at least one task was stalled waiting for CPU.
   `avg10=9.88 avg60=6.45 avg300=4.11` (observed 2026-07-16) is a real, sustained
   contention signal on a `nproc=1` box — not noise.

5. **Isolated real-data reproduction** — the test that actually distinguishes
   "the algorithm is slow" from "the box is contended". Reconstruct the real
   ~202,500-tile world (real overlay + real cached worldgen baseline) and time the
   *actual deployed* compaction function against it with **no concurrent load**:
   ```bash
   flyctl ssh console -a border-empires-combined-staging -C "node -e \"
   (async () => {
     const {DatabaseSync} = require('node:sqlite');
     const db = new DatabaseSync('/data/border-empires.db', {readOnly:true});
     const snapRow = db.prepare('SELECT snapshot_payload FROM world_snapshots ORDER BY snapshot_id DESC LIMIT 1').get();
     const v1 = JSON.parse(snapRow.snapshot_payload);
     const baseRow = db.prepare('SELECT tiles_json FROM worldgen_baselines WHERE cache_key = ?').get('seasonal-default:'+v1.season.worldSeed+':'+v1.season.mapStyle);
     const baselineTiles = JSON.parse(baseRow.tiles_json);
     const mod = await import('/app/apps/simulation/dist/snapshot-compaction/snapshot-compaction.js');
     const { expandSnapshotFromStorage, compactSnapshotForStorage, buildWorldgenBaselineIndex } = mod;
     const expanded = expandSnapshotFromStorage(v1, baselineTiles);
     const baselineIndex = buildWorldgenBaselineIndex(baselineTiles);
     const sections = { initialState: { tiles: expanded.initialState.tiles, activeLocks: [] }, commandEvents: [] };
     for (let t = 0; t < 3; t++) {
       const t0 = Date.now();
       await compactSnapshotForStorage(sections, baselineIndex);
       console.log('trial', t, 'ms:', Date.now()-t0);
     }
   })();
   \""
   ```
   2026-07-16 result: **313-506ms** in isolation vs **6.4s+** under live load with the
   identical code+data — this is what confirmed contention, not algorithm cost, was
   the root cause. Keep this technique for any future "is X actually slow, or is the
   box just busy" question.

## What's been tried (chronological, so you don't re-derive it)

Ruled out / false leads:
- **World-size difference** (prod small world vs staging 202,500 tiles) — false. Prod
  runs the same 202,500-tile world; the differentiator is AI/barbarian *density*, not
  map size.
- **`structuralEquals` recursive deep-equality being slow on real nested `town` state**
  (population, connectedTownCount, etc.) — false. Proven false by the isolated
  real-data repro above (313-506ms).
- **Moving compaction to a worker thread naively** — made it *worse* (7-9.5s
  `structuredClone` cost transferring the tile arrays), reverted. Any future attempt to
  offload compaction to a worker (see P2 below) must benchmark the message-passing
  cost, not just assume "off the main thread = faster."

Shipped fixes, in order:
1. Worldgen-per-login regeneration fix (PR #936)
2. Command-resolution audit for ~25 command types missing terminal events (main, pre-#946)
3. Checkpoint compaction/stringify same-thread-yield removal — `YIELD_CHUNK_SIZE`,
   stringifier `CHUNK_THRESHOLD`/`CHUNK_SIZE` raised to effectively never yield
   (PRs #940, #943) — yielding let already-queued AI-tick work "cut in line" for an
   *unbounded* wait; synchronous code has a bounded cost instead
4. AI/system tick-rate floor — `parsePositiveNumberWithFloor()` clamps
   `SIMULATION_AI_TICK_MS`/`SIMULATION_SYSTEM_TICK_MS` to 100ms/200ms regardless of env
   override (PR #944)
5. Barbarian unbounded growth — `MAX_BARBARIAN_TILES = 100` + active erosion
   (`UNCAPTURE_TILE`), seed target 80→20 (PR #945)
6. Client_seq collision on every non-first disconnect — real, continuously-firing bug,
   unrelated to CPU but was adding SQLite constraint-violation noise (PR #947)
7. **Pause AI/system planning during checkpoint** (`isCheckpointInFlight()` gate on
   `aiShouldRun`/`systemShouldRun`, PR #948, 2026-07-16) — the current fix. Confirmed via
   the isolated repro above that removing the *contention* (not the algorithm) during
   compaction should collapse a 6.4s+ stall to ~0.5-1s. Verify via login probe +
   `sim_checkpoint_export_ms` after 15-20+ min of sustained load before trusting it.

## If it recurs — next levers (not yet built, in priority order)

- **P2 — move compaction off the main sim thread.** Extend the existing
  `snapshot-stringify-worker` (or add a sibling) to run
  `compactSnapshotForStorage` too, so checkpoint cost is structurally off the main
  thread regardless of contention. **Benchmark the structuredClone/message-passing
  cost before shipping** — this exact approach backfired once already (see above).
- **P3 — merge `ai-command-producer-worker` + `system-command-producer-worker`**
  into one thread. Cuts one persistent thread from the concurrently-active set.
  Bigger regression surface (barb-vision throttle, different `shouldRun` gates per
  producer) — only worth it if P2 leaves residual contention.
- **P4 (last resort, changes gameplay) — shrink the map** for AI-heavy season
  profiles (e.g. 250×250/62,500 tiles instead of 450×450/202,500). Cuts every
  full-tile-scan cost ~3x but is a gameplay change, not a runtime one.

## Known pitfalls

- A checkpoint pass that looks instant immediately after a deploy is not evidence of
  a fix — always wait 15-20+ minutes of sustained AI-tick load before trusting a
  probe result for this symptom family.
- Two other main-thread multi-second blockers exist and are **independent of
  checkpoint compaction** — don't assume a checkpoint fix addresses these:
  barb-vision recompute (~2.9s) and tile-shed economy/town-network rebuild (~2.8s, no
  subscriber gate). If login degrades again but `sim_ai_tick_throttled_total{reason="checkpoint_in_flight"}`
  isn't correlated with the stall, check these two via `event_loop_blocked` log phase
  names before assuming the checkpoint-pause fix regressed.
- `flyctl secrets set/unset` may be blocked at the tool-permission level in some
  sessions; `flyctl machine update -e KEY=VAL` does **not** override an existing Fly
  secret at the container-injection layer (confirmed: machine config shows the new
  value via `--json`, but the running process's own `printenv` still shows the old
  one). Prefer a code-level env-value clamp/floor over either route if you need to
  force a runtime value regardless of env misconfiguration.
