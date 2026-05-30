# Fix QUEUE_PERSIST_FAILED — 2026-05-30

> Agent hand-off. Single PR. Read all of it.

## Why

Prod is emitting `QUEUE_PERSIST_FAILED` ("command could not be
persisted by gateway") when players submit commands. Sequence
observed 2026-05-30 21:41 UTC:

```
21:41:09  QUEUE_PERSIST_FAILED       ← gateway's own SQLite write failed
21:41:24  SIMULATION_UNAVAILABLE     ← 15s later, sim gRPC timed out
21:42:35  SIMULATION_UNAVAILABLE     ← 71s later, again
```

The first error is the new failure mode: the gateway's local SQLite
write (`commands` table) is failing. `frontier-submit.ts:78` calls
`deps.commandStore.persistQueuedCommand(...)` inside a try/catch; any
thrown error becomes `QUEUE_PERSIST_FAILED`.

Most likely cause: **gateway and sim share the same SQLite file
(`/data/border-empires.db`)**. Sim's heavy write pattern (event-store
appends every command, snapshot rotation every ~9 min writing 28MB
blobs) holds WAL locks. When the gateway tries to persist a command
during that window, the write times out or fails.

Note: this is a *gateway SQLite* problem, not a sim gRPC problem.
The plan to cap the narrow planner path
(`docs/plans/2026-05-30-cap-narrow-analyze-path.md`) addresses the
SIMULATION_UNAVAILABLE class. QUEUE_PERSIST_FAILED is independent.

## Goal

Zero `QUEUE_PERSIST_FAILED` errors under normal play. Commands that
the gateway accepts should always persist.

## Strategy — two paths, pick one (or do both if time)

### Path 1 (preferred, simpler) — retry with backoff

`persistQueuedCommand` likely uses `node:sqlite` which throws
`SQLITE_BUSY` when WAL is locked. Wrap the call in a 3-attempt retry
with short backoff (50ms, 150ms, 300ms). Total worst case: ~500ms,
well under any client-facing timeout.

**Where:** `apps/realtime-gateway/src/frontier-submit.ts:77-87`.
Probably also other call sites of `persistQueuedCommand` — grep for
them and wrap each (or wrap inside `persistQueuedCommand` itself).

**Test for `SQLITE_BUSY` specifically** — don't retry on schema errors
or other non-transient failures. The retry should only handle lock
contention.

### Path 2 (bigger, more permanent) — split databases

Gateway and sim have **no shared rows** today:
- Gateway uses: `commands`, `command_results`, `player_profiles`,
  `auth_identity_bindings`, `rally_links`, `social_*`
- Sim uses: `world_events`, `world_snapshots`, `world_status_current`,
  `season_archive`

They share a file purely for ops simplicity (one volume, one backup).
There's no transactional join.

**Move gateway tables to `/data/gateway.db` and sim tables to
`/data/sim.db`.** Same volume, different files, no WAL contention.

This is a bigger change (migration script needed for existing prod
data, plus updating all the store constructors to take separate
paths). Defer unless Path 1 doesn't fully resolve.

## What to change (Path 1)

1. **Find all `persistQueuedCommand` call sites:**
   ```
   grep -rn "persistQueuedCommand" apps/realtime-gateway/src
   ```
2. **Wrap each with `withSqliteRetry(...)`** — add a helper like:
   ```ts
   const withSqliteRetry = async <T>(op: () => Promise<T>, label: string): Promise<T> => {
     const delays = [50, 150, 300];
     let lastErr: unknown;
     for (let attempt = 0; attempt <= delays.length; attempt += 1) {
       try {
         return await op();
       } catch (err) {
         lastErr = err;
         const code = (err as { code?: string } | undefined)?.code;
         if (code !== "SQLITE_BUSY" && code !== "SQLITE_BUSY_TIMEOUT") throw err;
         if (attempt === delays.length) break;
         await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
       }
     }
     throw lastErr;
   };
   ```
3. **Metric:** add `gateway_sqlite_retry_total{op="persist_queued_command"}`
   incremented on each retry. Lets you see how often contention bites.
4. **Logging:** on terminal failure (all retries exhausted), log with
   `recordGatewayEvent("error", "queue_persist_failed", { ... })` —
   should already exist, just confirm.

## Validation

- Staging won't reproduce easily because staging's sim is lighter.
  That's OK — the retry is a defensive fix, not a behavior change.
- After prod deploy:
  - `QUEUE_PERSIST_FAILED` count should drop to ~0
  - `gateway_sqlite_retry_total` should fire occasionally (proves
    the retry path is exercised)
  - If retries are constantly hitting attempt 3, that means the
    underlying contention is severe enough to need Path 2.

## What NOT to do

- Do NOT swallow non-SQLITE_BUSY errors. Schema mismatch or disk-full
  should still fail loudly.
- Do NOT raise the retry count beyond 3. If we're retrying 5+ times,
  we have a different problem.
- Do NOT touch the sim's write path. Adding `BEGIN IMMEDIATE` or
  longer busy_timeout on the sim side is a different PR.

## Tradeoff to surface

- Worst-case command latency increases by ~500ms (~3 retries × backoff).
  Client-facing impact: a contended command takes <1s extra; better
  than failing outright.
- Adds a small new helper. Trivial code, easy to remove if we go to
  Path 2 (split DBs).

## Self-review checklist

- [ ] All `persistQueuedCommand` call sites wrapped (or wrap inside
      the function itself — preferred).
- [ ] Only `SQLITE_BUSY` triggers retry; other errors throw immediately.
- [ ] Retry-counter metric registered.
- [ ] Logged error event preserved on terminal failure.
- [ ] PR body links to this plan and includes the 21:41 UTC prod log
      excerpt as evidence.
