# Backup snapshot vs. the live game (2026-11-27)

Status: measurement record (local reproduction; production not touched)

Question: do the hourly backup snapshots stall the game, as two staging
watchdog kills that coincided with them suggested, and does the cause lie in
SQLite lock contention? Script: `scripts/sector-memory-probe/backup-stall-probe.mjs`.
Runbook: [`../agents/deploys.md`](../agents/deploys.md) "Backups".

## Setup

- `scripts/sector-memory-probe/run-stack-in-image.sh`: production base image
  (`node:22-alpine`), `deploy/env/production.env`, 2 cores, 60 AI Houses, plus 40 humans
  playing for the whole run (`late-contest-probe.mjs`, `PROBE_AWAY_S=0`). That makes 100 Houses.
- The world database was padded with an inert table to about 1 GB, the
  production size given in `deploys.md` (where `VACUUM INTO` takes 30-60 s).
- The snapshot ran the way the timer runs it: `docker exec <app> nice -n 19 node …`
  inside the app container, against the live `/data` database.
- This machine's disk is much faster than a Hetzner cloud disk (an
  unthrottled 1 GB `VACUUM INTO` took 2.4 s, with no effect on the game). So the
  container's disk was throttled to 40 MB/s read and 40 MB/s write (blkio), which
  reproduces production's 30-60 s copy. Page cache was dropped before each run.
- Measured: `/healthz` latency every 250 ms (the gateway main thread, which the
  30 s watchdog watches), the simulation thread's event-loop max, AI tick p99,
  WAL size, and checkpoint/stall log lines.

## Results

| Run | Memory limit | Snapshot | Worst stall (gateway) | Notes |
|---|---|---|---|---|
| 1x `VACUUM INTO` | 4 GB | 50 s | 7 ms (baseline 46 ms) | WAL 4 → 24 MB, no stall |
| 2x `VACUUM INTO` at once | 4 GB | 63 s | 706 ms (p99 204 ms) | the 2026-10-02 overlap |
| 1x `VACUUM INTO` | 1.2 GB | 28 s, 25 s | **2,512 ms, 952 ms** | page cache cannot hold DB + copy |
| 1x `VACUUM INTO` | 2.5 GB | 32 s, 27 s | **2,069 ms, 922 ms** | baseline 39 ms |
| 1x paced, 16 MB/s, no check | 2.5 GB | 127 s, 127 s | **16 ms, 17 ms** | baseline 36 ms; sim loop in baseline range |
| 2x paced at once | 2.5 GB | 128 s | 104 ms | baseline 157 ms |
| 1x paced + `quick_check` of copy | 1.2 GB | 177 s | 4,292 ms | quick_check alone took 50 s |
| SQLite online backup API, 2,560-page steps | 4 GB | never finished | n/a | restarted 6,498 times in 10 min |

The simulation thread's event-loop max and AI tick p99 stayed within their
baseline range in every run; the WAL never passed 68 MB; no slow checkpoint
phase lined up with a snapshot.

## Conclusions

- **The lock-contention hypothesis does not hold.** In WAL mode the snapshot's
  read transaction never blocked the game's writers, and the WAL stayed small.
- **The cause is disk and page-cache pressure.** `VACUUM INTO` reads the whole
  database and writes a whole copy in one statement. On a server whose memory
  cannot cache both, the game's synchronous SQLite reads on the gateway thread
  wait behind that burst: 1-2.5 s stalls per run here, worse with less memory
  or a slower disk, and about 3x the IO when two runs overlap. A 30 s stall
  (the watchdog limit) was not reproduced; it needs harsher conditions than
  these. Production memory and disk speed are the deciding unknowns.
- **Fix: paced copy** (`deploy/bin/backup-snapshot.mjs`). One read transaction,
  rows copied a few MB at a time with a sleep after each, then streamed through
  zstd at the same rate. No full re-read (`quick_check`) on the server; restore
  runs `integrity_check`. 16 MB/s takes about 2 minutes per GB.
- The online backup API is unusable on this database: in WAL mode it restarts
  whenever another connection writes. Copying "just after the simulation's own
  checkpoint" was not needed: the stalls are not caused by checkpoint or lock
  timing, so timing the snapshot would not remove the IO burst.

## Restore rehearsal

On this machine, with the real `deploy/bin/backup` and `deploy/bin/restore-backup`,
a local rclone remote standing in for B2, and a WAL-mode writer committing
every 50 ms: backup exit 0 (zstd checksum present), check-only restore passed
(integrity_check, deletion-ledger dry run, game kept running), `--apply`
swapped the copy in, reapplied the ledger, and the app was healthy 5 s later
with the previous database kept in `pre-restore-<stamp>/`. A 1 GB paced
backup of the 100-House world was restored and the real game stack booted
from it (60 AI Houses and 204,800 tiles recovered, humans played).
