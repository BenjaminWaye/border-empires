# Fly Logs & Runtime Debugging

## Scope

How to pull logs/metrics from Fly-hosted staging and production and diagnose the
recurring failure classes (main-thread stalls, watchdog kills, SQLite/pruning health).
Does not cover deploy mechanics (`docs/agents/deploys.md`) or client/UI bug workflow
(`docs/agents/testing-and-debugging.md`).

## Apps

- Staging: `border-empires-combined-staging`
- Production: `border-empires-combined`

## Reading logs

```bash
flyctl logs -a <app> --no-tail -n 200      # historical, capped ~100-200 lines returned
flyctl logs -a <app>                        # live tail — use this to catch a kill window
```

`--no-tail` only returns a shallow buffer (~100 lines, ~9 min of activity on a busy
prod instance) — a crash can scroll out before you read it. If you're trying to catch
a specific event (a kill, a stall), start a live tail *before* it happens rather than
retrieving history after the fact. See "Death forensics evaporate" below.

For isolated/remote sessions that can't reach `fly.io` directly, see
`docs/agents/topics/staging-access.md` for the proxy-allowlist vs. paste-into-session
options — same options apply to prod, just swap the app name.

## Key log lines to grep for

| Line | Meaning |
|---|---|
| `event_loop_blocked` | Main-thread stall; entry names the operation running at the time. Correlate timestamp to what the sim was doing. Rolling p99 histograms can hide periodic blockers — this line is the real signal. |
| `event_loop_watchdog_kill` | Gateway main thread stalled 30s+, in-process watchdog SIGKILLed it. Rate-limited to 1 kill / 30 min via `/data/.watchdog-last-kill`. This is **not** a Fly OOM kill even though the machine log shows `exit_code=137`. |
| `simulation worker exited code=` | Sim worker thread crashed (separate from gateway main thread — invisible to the watchdog, surfaces as gRPC timeout / `SIMULATION_UNAVAILABLE` instead of a kill). |
| `simulation lag diagnostic: <name>` | Existing per-phase timing wrapped around `sync_players_export`, `sync_players_total`, `tile_delta_filter_slow`, `simulation_ai_worker_slow`, `simulation_persistence_slow`, `capture_reveal_build_slow`, `runtime_queue_drain_slow`, `runtime_submit_command_slow`, `simulation_submit_command_slow`, prepare-player slow log. If `durationMs >= 30000` on one of these, that's your culprit — check these *before* adding new instrumentation. |
| `season ended — gameplay tickers stopped` | Season ticker halted; explains both AI and barbarians going idle at once. |
| `utilityWinner` / `utilityWinnerScore` | AI decision log — what it chose and its score. |
| `noCommandReason` | Why the AI emitted no command (`wait_and_recover`, `development_process_limit`, etc.). |

## exit_code=137 playbook (production)

`exit_code=137, oom_killed=false` on a `border-empires-combined` machine is almost
always the in-process event-loop watchdog, not a Fly-level OOM. Don't reach for a RAM
bump. Order of investigation:

1. `flyctl machine status <id> -a border-empires-combined` — read Event Logs, note kill
   timestamps and uptime between them.
2. **Wait 20+ min before calling it a death spiral.** A single 137 right after a deploy
   is usually cold-start tax, not a recurring cycle. Don't extrapolate a loop period
   from N=1.
3. Grep `recordLagDiagnostic` phases in `apps/simulation/src/simulation-service.ts`
   (see table above) before adding new instrumentation — 8 phases are already wrapped.
4. Check SQLite/pruning health (below). If `world_events` is in the millions, pruning
   is broken; if under 10k, the DB isn't the problem.
5. If you need to catch the actual kill window, live-tail `flyctl logs` rather than
   relying on `--no-tail` history — see forensics note below.

## SQLite prod probe

The combined container has Node but no `sqlite3` CLI and no `curl`. Query the volume
directly via `node:sqlite` over `flyctl ssh console`:

```bash
flyctl ssh console -a border-empires-combined -C "node -e \"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/data/border-empires.db');console.log(db.prepare('SELECT COUNT(*) AS rows FROM world_events').all(),db.prepare('SELECT COUNT(*), MIN(last_applied_event_id), MAX(last_applied_event_id) FROM world_snapshots').all());\""
```

- `world_events` row count should be thousands, not millions. **Trap:** `event_id` is
  monotonically increasing across the season — a `max_event_id` in the millions does
  NOT mean millions of rows. After pruning, actual `COUNT(*)` can be under 5,000 even
  with `max_event_id` in the millions. Always read `COUNT(*)`, never the max id, as the
  row count.
- `world_snapshots` row count is the retention setting (3 by default,
  `sqlite-snapshot-store.ts:83-89`).
- `MIN/MAX(last_applied_event_id)` on snapshots shows the replay window on cold boot.
- Other useful probes against `/data/border-empires.db`:
  - Snapshot blob sizes: `SELECT snapshot_id, LENGTH(snapshot_payload) FROM world_snapshots ORDER BY snapshot_id DESC LIMIT 5` (expect ~20MB each for a prod-size world).
  - `ls -lh /data` — DB file size is a high-water mark; it doesn't shrink without
    `VACUUM` even though free pages get reused, so file size overstates active data.

## Metrics

Both apps expose Prometheus metrics on `:50052/metrics` internally (loopback only —
per-player AI buffers only show up in the 1Hz stdout dump, not the endpoint, so scrape
via logs for those). From `flyctl ssh console`:

```bash
curl -s http://127.0.0.1:50052/metrics | grep -E "sim_ai_|sim_tick_duration|sim_checkpoint_export_ms"
```

Verify current metric names against `apps/simulation/src/metrics/metrics-prometheus.ts`
before relying on them — they drift. Useful ones as of last check:

- `sim_ai_command_total` — increments per AI command submitted; flat for several
  minutes means the AI loop is frozen.
- `sim_ai_noop_total` — AI explicitly decided not to act.
- `sim_ai_last_command_accepted_at_ms` — gauge of last accepted AI command; stale
  timestamp means a frozen player.
- `sim_tick_duration_ms` — overall tick duration histogram (not AI-specific).
- `sim_checkpoint_export_ms` — canary for the checkpoint export path; should be
  <500ms. A synchronous full-tile iteration here once blocked the sim worker ~18s per
  checkpoint (fixed in PR #590 with `shouldYieldAt` + `setImmediate` yields) — a p99
  spike here means that regressed.

## Common freeze causes

| Symptom | Likely cause |
|---|---|
| Both AI and barbarians frozen | Season ticker stopped early (`season ended — gameplay tickers stopped` in logs) or worker thread crash |
| AI only frozen, barbarians moving | AI tick loop crash or `tickInFlight` stuck true |
| AI expanding but not attacking | `frontPosture` stuck off `BREAK` — read `apps/simulation/src/ai/automation-strategic-snapshot.ts` directly, thresholds vary by `primaryVictoryPath` |
| Barbarians only frozen | `system-job-barbarian-planner` job not scheduled |

## Why log correlation beats metric-first debugging

Sim latency regressions often look like AI load from the metrics alone but are
actually a periodic, not sustained, blocker — a rolling p99 histogram averages a spike
that fires once every N events and is otherwise quiet for minutes. `event_loop_blocked`
log entries name the exact operation running at stall time; ten PRs once optimized the
wrong theory (AI load) before log correlation found the real cause (a synchronous
checkpoint export). When latency regresses without an obvious metric spike, grep logs
for `event_loop_blocked` before assuming the source.

## Death forensics evaporate from the log buffer

`flyctl logs` retention is shallow — a crash's breadcrumbs scroll out of the live
buffer within ~9 minutes on a busy instance, before anyone reads them. This is why
long-running mystery instability (e.g. a 3-month `SIMULATION_UNAVAILABLE` saga) can
stay unsolved despite decent existing instrumentation: the phase-level lag diagnostics
and watchdog heartbeat data (`getDiagSnapshot` in
`apps/realtime-gateway/src/main-merged.ts`) exist, but nobody catches them before they
disappear. Two distinct death paths both surface as `SERVER_STARTING`:

1. Gateway main thread stalls 30s → watchdog SIGKILLs
   (`apps/realtime-gateway/src/event-loop-watchdog.ts:180`) → `event_loop_watchdog_kill`.
2. Sim worker exits non-zero → `process.exit`
   (`apps/realtime-gateway/src/main-merged.ts:84`) → `simulation worker exited code=`.
   The watchdog only watches the gateway main thread, so a pure sim-worker stall is
   invisible to it — it shows up as a gRPC timeout / `SIMULATION_UNAVAILABLE` instead
   of a kill line.

If you're chasing an intermittent crash, start a live `flyctl logs` tail *before* the
next expected occurrence rather than trying to reconstruct it from `--no-tail` after
the fact.
