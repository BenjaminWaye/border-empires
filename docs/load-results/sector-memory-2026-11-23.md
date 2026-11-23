# Memory for a 100-House Sector Contest — 2026-11-23

Status: measurement record (launch gate 1, [`docs/gdd.md`](../gdd.md) §9 and §11)

## Summary

- **Confirmed.** With 100 Houses (60 AI + 40 connected humans) the server is
  above its 700 MB checkpoint watermark within the first minute and stays
  there. Every regular checkpoint is put off until 4,000 events have piled up.
- **It grows as the contest ages.** On `develop`: 721 MB at 1 minute, 1,218 MB
  at 38 minutes, still climbing. The simulation's own heap went from 326 MB to
  568 MB of its 900 MB limit in that time.
- **This branch removes about 150 MB of simulation heap** (aged world, after
  garbage collection: 492 MB → 346 MB) and one leak that grew without a
  practical limit. Process memory at the same age is about 120–140 MB lower.
- **100 Houses still does not fit under the 700 MB watermark.** After the
  changes the process passes 700 MB at about minute 5 and settles around
  0.9–1.1 GB. Checkpoints are still deferred.
- **It does fit in the server.** 1.1 GB is well inside the 4 GB of a Hetzner
  CX23. The watermark is a setting, not the size of the machine. What to do
  about it is a decision for the owner; the options are in
  [Decision needed](#decision-needed).
- Measured on a cloud container, not on Hetzner, for at most 100 minutes of a
  contest that lasts up to 30 days. See [Not measured](#not-measured).

## How it was measured

The real stack: the simulation in a worker thread and the gateway on the main
thread of one Node process, the same shape as production
(`apps/realtime-gateway/src/main-merged.ts`), from a production build, with
`deploy/env/production.env` except `SIMULATION_AI_PLAYER_COUNT=60`. Fresh
generated world, 640×320 (204,800 tiles, 87,274 of them land). Nothing was
deployed and no live environment was touched.

- `scripts/sector-memory-probe/launch-stack.mjs` starts the stack with a
  throwaway token-signing key so any number of humans can log in.
- `scripts/sector-memory-probe/probe.mjs` logs in 40 humans, joins each to the
  contest, has each tap one of their own tiles every 5 s, and records the
  stack's memory metrics every 30 s.
- `scripts/sector-memory-probe/thread-heap-preload.cjs` makes every thread of
  the process report its own heap, and writes a heap snapshot of one thread on
  request.
- Baseline and changed builds ran side by side, each pinned to 2 of the
  machine's 4 cores, each on its own generated world.
- "Process memory" is resident memory (RSS), the number the watermark is
  compared against. Figures at a given minute are the average of the samples
  within one minute of it.
- Heap snapshots were ranked by retained size with a one-off script (not
  committed). They open in Chrome DevTools.

Each configuration is one run, except the baseline, which was run twice for
the first 18 minutes (750 / 721 MB at 1 minute, 885 / 879 MB at 10 minutes).

## 1. The problem, reproduced

### Where the 700 MB comes from

`deploy/env/production.env` and `staging.env` set
`SIMULATION_CHECKPOINT_MAX_RSS_MB=700` and
`SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB=480`. Both values were carried over
from the Fly machines. `snapshot-checkpoint-manager.ts` reads
`process.memoryUsage()` in the simulation thread before each regular
checkpoint and skips it if either is exceeded:

- the 700 MB is compared with the memory of the **whole process**: gateway,
  simulation and seven helper threads;
- the 480 MB is compared with the simulation thread's own heap.

The process holds nine separate heaps. With 100 Houses at 18 minutes on
`develop`: simulation 570 MB, gateway 98 MB, AI planner thread 68 MB, six
smaller threads 82 MB between them, plus about 230 MB outside any heap.

### What "deferring" does

`SIMULATION_SNAPSHOT_EVERY_EVENTS=1000` asks for a checkpoint every 1,000
events. When memory is over a watermark that checkpoint is skipped, and tried
again 1,000 events later. `SIMULATION_CHECKPOINT_FORCE_AFTER_EVENTS=4000` then
forces one regardless of memory.

Measured on `develop`, 42 minutes, 100 Houses:

| | |
|---|---|
| Checkpoints saved | 12, every one of them forced at 4,000 events |
| Checkpoints skipped for memory | 37 |
| Events per minute | about 1,160 |
| Time between checkpoints | about 3.4 minutes, instead of about 52 seconds |
| Memory added while a checkpoint is built | 7–40 MB |

So the watermark does not stop checkpoints from running while memory is high.
It makes them four times rarer.

**What that costs after a crash.** The server was killed without warning at
event 49,471. The last checkpoint was at event 48,044. On restart it replayed
the 1,427 missing events in 0.9 s and was ready in 12 s. A second hard stop,
3,663 events after its last checkpoint, replayed in 1.1 s and was ready in
14 s. Territory came back complete both times.

The exposure is in what replay does not restore. Per-player values such as
manpower live only in checkpoints
(`simulation-service-checkpointing.ts`, `saveShutdownCheckpoint`), so after a
crash they return to their value at the last checkpoint: up to about 3.4
minutes old instead of about 52 seconds. This rollback was read from the code,
not observed in the test. A normal deploy is not affected: a graceful stop
saves a final checkpoint and ignores the watermark.

### Memory over time, `develop`

100 Houses, one run.

| Minute | Process memory | Simulation heap in use | Land owned |
|---|---|---|---|
| Boot, nobody connected | 611 MB | 186 MB | 0.1 % |
| 1 | 721 MB | 326 MB | 2 % |
| 10 | 879 MB | 406 MB | 18 % |
| 20 | 1,067 MB | 504 MB | 36 % |
| 30 | 1,137 MB | 541 MB | 42 % |
| 38 | 1,218 MB | 568 MB | 44 % |

After the hard stop at minute 43, the same world restarted at 852 MB with
nobody connected.

## 2. What holds the memory

Heap snapshot of the simulation thread on `develop` at 40 minutes: 492 MB
after garbage collection. Largest holders, by what each keeps alive:

| # | Holder | Size | What it is |
|---|---|---|---|
| 1 | Tile-delta stringify cache | 66 MB | One entry per tile of the world, 204,800 of them, almost all empty |
| 2 | Per-player snapshot cache | 58 MB | 101 cached login snapshots; 38 MB of it for AI Houses that never log in. Each entry carries its own 0.4 MB copy of the world's dock list |
| 3 | Live world tiles | 51 MB | The game state itself |
| 4 | Snapshot tile cache | 48 MB | A second copy of every tile, in checkpoint format |
| 5 | Worldgen baseline | about 61 MB | A third copy of every tile, as generated, which checkpoints are diffed against (41 MB), its index (12 MB) and the diff memo (8 MB) |
| 6 | Command replay cache | 33 MB | 6,642 recorded commands, none of them sent by a client |
| 7 | AI planner sync state | 22 MB | |
| 8 | Fog-of-war coverage | 18 MB | Grows with owned land |
| 9 | Spawn placement index | 16 MB | |
| 10 | AI decision diagnostics | 16 MB | Last 100 decisions per AI House, about 2.6 KB each |
| 11 | AI planner tile view | 11 MB | |

The rest is strings, compiled code and smaller structures. A snapshot from a
second baseline run at 7 minutes was 337 MB: holders 1, 3, 4 and 5 were
already at full size, since they are fixed by the size of the map, and holders
2, 6, 8 and 10 were small.

Holder 6 is a leak. The replay cache exists so a command a client sends twice
is answered once. Server-generated commands are meant to be kept out of it by
a list of id prefixes. Four prefixes were missing from the list, and with 60
AI Houses they filled the cache: 6,642 entries at 40 minutes, 14,644 at 97
minutes, on course for its cap of 50,000. At the measured 5 KB per entry the
cap is about 250 MB. That projection was not run to the end.

## 3. What this branch changes

Five changes, all in `apps/simulation`. Each has a test that fails without it.

| Change | File | Measured effect |
|---|---|---|
| The stringify cache keeps an entry only for a tile that has a structure, and a last-sent record only for a tile that has been sent | `tile-delta-stringify-cache/` | 66 MB → 20 MB |
| The snapshot tile cache reuses the tile object the world was loaded from when it is identical, instead of copying all 204,800 | `snapshot-tile-boot/` | 48 MB → 8–15 MB |
| A cached login snapshot that has fallen behind, and so can never be served again, drops its tiles and dock list | `player-snapshot-cache/` | 58 MB → 17 MB; AI entries 38 MB → 0.7 MB |
| `reach-contested:`, `reach-auto-claim:`, `muster-tick:` and `muster-status:` commands are no longer recorded for replay | `command-event-lifecycle.ts` | 33 MB and growing → under 1 MB (205–336 entries) |
| Checkpoint compaction skips a tile that is the baseline object itself | `snapshot-compaction/` | Diff memo 8 MB → 1 MB, only until the first restart |

Each checkpoint now logs the size of the two tile caches
(`simulation checkpoint tile caches`).

### Before and after

Simulation heap after garbage collection, from heap snapshots:

| | `develop` | This branch |
|---|---|---|
| 40 minutes, 44–47 % of land owned | 492 MB | 356 MB (without the dock-list part of the third change) |
| Same world restarted, 15 minutes later, 51 % of land owned | not measured | 346 MB |

Process memory, 100 Houses, same minute of a fresh contest (each on its own
world, so land owned differs a little):

| Minute | `develop` | This branch | Difference |
|---|---|---|---|
| 1 | 721 MB | 627 MB | −94 MB |
| 10 | 879 MB | 782 MB | −97 MB |
| 20 | 1,067 MB | 942 MB | −125 MB |
| 30 | 1,137 MB | 1,015 MB | −122 MB |
| 38 | 1,218 MB | 1,080 MB | −138 MB |

Process memory falls less than the heap does because Node gives freed heap
back to the system slowly.

The "this branch" column was measured before the dock-list part of the third
change was added. With everything in, the 40-minute world was restarted and
run for 15 more minutes: 866 MB one minute after restart with 40 humans back,
then between 924 and 1,030 MB, with 51 % of land owned.

A run with only the first three changes was left going for 100 minutes: 1,059
MB at 38 minutes, 1,109 MB at 50, 1,188 MB at 100. Land ownership had levelled
off at 46 %; the growth after minute 50 matches the replay-cache leak that run
still had.

Checkpoints on this branch: the first five or six are regular, at 1,000
events. After about minute 5 the process is over 700 MB and every checkpoint
is forced at 4,000 events, as on `develop`.

## What a small Hetzner server can hold

For a CX23 (2 vCPU, 4 GB), from the measurements above:

| | |
|---|---|
| Houses | 100 (60 AI + 40 humans connected) ran for up to 100 minutes with no disconnects and no errors |
| Process memory, this branch | 0.9–1.1 GB with half the land owned |
| Room left in the server's 4 GB | about 2.9 GB |
| Simulation heap in use | about 350–450 MB of a 900 MB limit (`--max-old-space-size=900`) |
| Under the 700 MB checkpoint watermark | Only for the first 5 minutes |

Memory is not what stops 100 Houses on this server. Two settings are closer
than the hardware: the checkpoint watermarks (700 MB process, 480 MB
simulation heap), which are already exceeded, and the 900 MB heap limit, which
ends the process if the simulation heap reaches it. On `develop` the simulation
heap was at 568 MB and rising at 38 minutes, with the replay-cache leak adding
to it.

## Decision needed

100 Houses does not fit under the checkpoint watermark, before or after this
branch. The options, with what each costs. None of them is chosen here.

1. **Raise the watermarks.** A change to two lines in `deploy/env/*.env`.
   Checkpoints return to every 1,000 events. In these runs a process
   watermark above about 1,250 MB and a heap watermark above about 600 MB
   would never have deferred one. Cost: no money. Risk: the guard is there so
   a checkpoint is not started when memory is short; building one added
   7–40 MB here, and export took 0.23 s at the median and 0.71 s at the 95th
   percentile. Late-contest memory was not measured, so the right value is
   not known yet.
2. **Leave it as it is.** Checkpoints every 4,000 events, about 3.4 minutes at
   the measured rate. Cost: after a crash, per-player values such as manpower
   return to a state up to that old. Deploys are not affected.
3. **A bigger server.** More memory does not change anything by itself: the
   limits being hit are settings, and 2.9 GB of the current server is unused.
   It would matter only together with a higher heap limit, or to run more
   than one sector on a machine. Prices were not checked. CPU was not part of
   this work.
4. **Fewer Houses per sector.** Not measured. About 250 MB of the simulation
   heap is fixed by the size of the map (the three per-tile copies), whatever
   the number of Houses, so halving the Houses would not halve memory. This
   changes the product described in `docs/gdd.md` §6.
5. **Deeper rework.** What is left, largest first:
   - The three per-tile copies of the world: live tiles (51–55 MB), baseline
     and its index (about 53 MB) and, after a restart, the recovered tiles (about 49 MB).
     Removing one means changing how checkpoints are diffed or how tiles are
     stored.
   - Last-sent records in the stringify cache: 19 MB at 65,000 tiles, and they
     grow with every tile any player has been sent, up to all 204,800.
   - Fog-of-war coverage (19 MB) and AI planner state (22 + 13 MB): grow with
     owned land.
   - AI decision diagnostics (15 MB): debug history, could be shortened.
   - Dock lists in the snapshots of connected humans (0.4 MB each, 16 MB for
     40): could be shared.
   - Smaller server-generated command families still recorded for replay
     (`radius-yield-refresh:`, `attack-hold:`, `unsettle:`, `aether-shields:`
     and others): under 1 MB together at 55 minutes, bounded by the 50,000
     cap. They were left alone because each needs checking that no client
     ever resends it; `diplomacy-settle:`, for one, is sent by the gateway and
     must stay.

## Not measured

- **Real Hetzner hardware and the production image.** These numbers are from a
  4-core cloud container running Debian's C library. Production runs
  `node:22-alpine`, whose memory allocator behaves differently, on shared
  vCPUs. The heap figures should carry over; process memory may not.
- **A late contest.** The longest run was 100 minutes of a contest that lasts
  up to 30 days. Land ownership reached 45–51 %. Structures, technology,
  diplomacy and combat were all at an early stage. This is the largest gap.
- **Humans who play.** The 40 humans only tapped a tile. They sent no game
  commands, saw only their starting area, and never disconnected and
  reconnected.
- **More than 40 humans**, or 50 humans with 50 AI.
- **A revealed map.** PR #2932 measured about 320 MB extra while one reveal is
  built, on top of the figures here.
- **Contest end and rollover** into the next contest.
- **The per-player rollback after a crash.** Taken from the code.
- **A graceful stop.** The local launcher stops the process outright, so the
  final checkpoint on shutdown was not exercised.
- **CPU.** Both stacks shared a 4-core machine with test runs for part of the
  time. Nothing here says anything about CPU capacity.
- **Repeat runs.** One run per configuration, apart from the first 18 minutes
  of the baseline.

## Reproduce

```bash
pnpm --filter @border-empires/simulation build
pnpm --filter @border-empires/realtime-gateway build

RUN="$PWD/.local-data/sector-memory"; mkdir -p "$RUN"
set -a; . deploy/env/production.env; set +a
unset NODE_ENV HOST PLAY_ORIGIN GATEWAY_EMAIL_ALERTS_APP_URL
export SIMULATION_AI_PLAYER_COUNT=60 PORT=13101 SIMULATION_METRICS_HOST=127.0.0.1 \
  SIMULATION_SQLITE_PATH="$RUN/be.db" GATEWAY_SQLITE_PATH="$RUN/be.db" PROBE_DIR="$RUN" \
  NODE_OPTIONS="--max-old-space-size=900 --require $PWD/scripts/sector-memory-probe/thread-heap-preload.cjs"
taskset -c 0,1 node scripts/sector-memory-probe/launch-stack.mjs &   # wait for "[probe-stack] ready"

NODE_OPTIONS= PROBE_DIR="$RUN" PROBE_HUMANS=40 PROBE_DURATION_S=2400 PROBE_SAMPLE_S=30 \
  node scripts/sector-memory-probe/probe.mjs

# Heap snapshot of the simulation thread (thread 1); pauses it for about a minute
# and inflates process memory for the rest of the run:
touch "$RUN/snapshot-request-1"
```

`PROBE_STACK_ROOT=/path/to/another/checkout` runs that checkout's build
instead, for a side-by-side baseline. Output: `timeline.jsonl` (metrics),
`thread-heaps.jsonl` and `thread-names.jsonl` (per-thread heaps),
`process-samples.jsonl` (1 Hz process memory and CPU).
