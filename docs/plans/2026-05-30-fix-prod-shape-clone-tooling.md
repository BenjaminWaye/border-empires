# Fix prod-shape clone tooling — 2026-05-30

> Agent hand-off. Self-contained. Read all of it.

## Why

The clone tool at `scripts/ops/clone-prod-sqlite-snapshot.mjs` is
**broken against the live WAL-mode prod database**. It pulls
`/data/border-empires.db`, `.db-wal`, and `.db-shm` sequentially via
`fly ssh sftp get`. The script's comment claims this produces a
consistent point-in-time view; in practice the prod DB is mid-write
during every pull, so the main file lands on disk torn — multiple
b-tree pages have inconsistent rowids and free-page references.

Observed failure (2026-05-30, ~22:50 UTC):
- Pulled 920MB clone.
- `PRAGMA integrity_check` returned errors: `Tree 7 page 18562
  btreeInitPage() returns error code 11`, `Rowid 5935667 out of order`.
- Sim crashed on startup: `database disk image is malformed`.
- `sqlite3 .recover` reconstructed schema + events but the 28MB
  `snapshot_payload` BLOBs were dropped (length 0), making the
  recovered DB unusable for load-shape testing (only ~4k retained
  events; the other 5.9M were pruned long ago and live only inside
  the dropped snapshot blobs).
- Result: the **prod-shape gate cannot run**, blocking deploys.

This blocks `pnpm deploy:prod:all` because
`scripts/check-prod-shape-gate-result.mjs` requires a passing gate
result JSON. The 2026-05-30 deploy of SHA `957b62b` bypassed the
gate explicitly with logs-watch as the safety net — that bypass
must NOT be the steady state.

## Goal

`pnpm ops:prod-shape:clone-snapshot` produces a consistent,
`integrity_check`-clean SQLite snapshot of prod, every time, without
needing manual recovery and without stopping prod writes.

## Strategy

SQLite has three official ways to produce a consistent snapshot of a
live DB. Pick one (preferring 1 → 3 by simplicity):

### Option 1 — `VACUUM INTO 'snapshot.db'` on prod (preferred)

Runs server-side. Atomically writes a consistent copy of the DB into
a new file at a given path, without copying free pages. The result
is a smaller, defragmented, fully consistent DB.

Flow:
1. SSH into the prod machine.
2. Run `node -e 'const sql=require("node:sqlite"); const db=new
   sql.DatabaseSync("/data/border-empires.db"); db.exec("VACUUM INTO
   \"/data/border-empires.snapshot.db\"");'` (or equivalent).
3. `fly ssh sftp get /data/border-empires.snapshot.db ...` — one
   file, no WAL, no SHM.
4. `rm` the server-side snapshot once pulled.

**Pros:** server-side atomicity, one file (no WAL/SHM coordination),
smaller (no free pages, see also `docs/plans/2026-05-29-ai-planner-cost-cap.md`
note about the 920MB → 31MB logical content ratio — VACUUM is the
underlying op).
**Cons:** holds a read lock for the duration of the VACUUM (~30–60s
on a 920MB DB on Fly volumes). Writes are blocked during that window
— acceptable, the sim's writes are queued and resume after.

### Option 2 — SQLite `.backup` dot-command on prod

Same idea, uses SQLite's online backup API. Iteratively copies pages
in small batches, yielding between batches so writers aren't blocked
hard.

Flow:
1. `fly ssh console --app border-empires-combined` then run
   `sqlite3 /data/border-empires.db ".backup /data/snapshot.db"`.
2. `fly ssh sftp get /data/snapshot.db ...`.

**Pros:** doesn't block writers (interleaves).
**Cons:** requires `sqlite3` CLI on the prod image — verify it's
present (Debian-based Fly image probably has it; otherwise install
via `apt`).

### Option 3 — Open the DB with `node:sqlite` and use its backup API

If neither of the above works, write a Node.js script that uses the
`Database.prototype.backup()` method (Node 22+ supports this in
`node:sqlite`). Run via `fly ssh console` + `node -e '...'`.

## Implementation

### Step 1 — Update `scripts/ops/clone-prod-sqlite-snapshot.mjs`

Replace the three sequential `fly ssh sftp get` calls with:

1. **Server-side snapshot creation.** Run `fly ssh console --app $APP -C
   'node -e "..."'` to execute `VACUUM INTO '/tmp/snapshot.db'`.
   The Node one-liner uses `node:sqlite` (already a runtime dependency
   per earlier project usage; confirm).
2. **Single SFTP pull** of `/tmp/snapshot.db` to the local clone dir.
3. **Server-side cleanup**: `fly ssh console -C 'rm /tmp/snapshot.db'`.
4. Skip the WAL/SHM pulls entirely — `VACUUM INTO` output has no WAL.
5. Update the comment at the top of the file: the old "three files
   for consistency" rationale was wrong; document the new approach.

### Step 2 — Verify on staging first

Before pointing the new tool at prod:
- Run `pnpm ops:prod-shape:clone-snapshot --app
  border-empires-combined-staging`.
- Confirm `PRAGMA integrity_check` returns `ok` on the resulting file.
- Confirm `pnpm dev` against the cloned DB boots successfully (sim
  loads its latest snapshot, gateway connects).

### Step 3 — Document in docs/agents/deploys.md

Note the change of snapshot mechanism and the ~30–60s prod read-lock
window during snapshot creation (or that Option 2 avoids the hard
lock).

## What NOT to do

- Do not "fix" the existing sequential-pull approach. It is
  fundamentally wrong for a live WAL DB. Replace it.
- Do not stop the sim worker to take a snapshot. That defeats the
  point of an online backup mechanism.
- Do not run `VACUUM` (without `INTO`) on prod. That rewrites the
  prod DB in place and holds an exclusive write lock — a separate,
  bigger ask (the `2026-05-29-ai-planner-cost-cap.md` "shrink the
  DB" follow-up will eventually want this, but it's NOT this PR).

## Validation

After implementation, on staging:
```
pnpm ops:prod-shape:clone-snapshot --app border-empires-combined-staging
/opt/homebrew/opt/sqlite/bin/sqlite3 .prod-shape-clones/<ts>/border-empires.db "PRAGMA integrity_check;"   # expect "ok"
GATEWAY_SQLITE_PATH=.../border-empires.db SIMULATION_SQLITE_PATH=.../border-empires.db pnpm dev
# Wait for /health to return {"ok":true,"simulation":{"connected":true}}
pnpm ops:prod-shape:gate
```

Then re-run against prod and confirm the same flow works end-to-end.

## Tradeoff to surface in PR body

- **Snapshot creation time:** Option 1 holds a read lock for ~30–60s
  on prod. Sim writes queue during that window; no user-visible
  impact because gameplay tolerates ~1s+ command latency already.
  Option 2 avoids the hard lock at the cost of script complexity.
- **Snapshot freshness:** snapshot is a point-in-time, not a
  continuous mirror. Each gate run pulls a fresh one (~1–2 min total
  including SFTP).

## Self-review checklist

- [ ] Old three-file pull removed.
- [ ] New single-file `VACUUM INTO` (or `.backup`) flow in place.
- [ ] Server-side temp file is cleaned up on success AND on failure.
- [ ] Staging clone passes `integrity_check`.
- [ ] Local stack boots against the clone.
- [ ] `pnpm ops:prod-shape:gate` runs to completion against the clone.
- [ ] `docs/agents/deploys.md` updated.
