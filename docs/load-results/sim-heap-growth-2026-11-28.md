# What grows in the simulation heap — 2026-11-28

Status: measurement record (launch gate 1, [`docs/gdd.md`](../gdd.md) §9 and §11)

Follows the three-day soak in
[`late-contest-2026-11-24.md`](late-contest-2026-11-24.md) §4: simulation heap
after garbage collection rose from about 400 MB on day 1 to 470 MB on day 3,
still about 1.2–1.5 MB an hour, which on a straight line reaches the 900 MB
heap limit (`--max-old-space-size=900`) with peaks around day 10. Nobody had
looked at what holds it.

## Summary

- **The soak's growth follows owned land, not time.** Across the soak, heap
  after GC rose 5.0 KB for every newly owned tile (383 → 470 MB while owned
  land went 56.5k → 73.9k tiles). On day 3 land was still being taken at about
  300 tiles an hour: 300 × 5.0 KB = 1.5 MB an hour, the whole of the measured
  growth. The aged world measured here shows the same 5.0 KB per owned tile.
  Owned land cannot pass the map's 87,274 land tiles, so this growth has a
  ceiling.
- **Nothing found grows with time alone without a bound.** The structures that
  grow with time (AI decision history, activity logs, command replay cache)
  all have caps or 24-hour windows and were filling to them.
- **One memo that grew without a bound, now bounded** (leak): the vision
  footprint memo kept every (tile, vision radius) ever computed for the whole
  season; radius grows with technology, so old entries piled up. 3 → 21 MB in
  24 game hours, not levelling off. Now capped, packed, counted.
- **The largest growing holder, made about half the size** (legitimate
  growth): fog-of-war "why is this tile visible" tags, a Map per covered tile
  per House, 44 MB at 46k owned tiles. Now 23 MB on the same world.
- **On the same world, from the same restart:** growth halved, 3.7 → 1.8 MB
  per game hour over the same ten game hours (both runs took 1.5k tiles),
  and the heap was 42 MB smaller (417 → 375 MB) at 48k owned tiles.
- **Projection:** applied to the soak, heap after GC on day 3 would have been
  about 400 MB instead of 470, growing about 1.2 MB an hour instead of 1.5.
  If growth stops when the land is full, as the measurements say it should,
  heap after GC levels off near 455 MB with peaks near 600–650 MB: no limit
  is reached in 30 days. If it does not stop and the day-3 rate simply
  continues, peaks reach 900 MB around day 13 (day 10 before). A full map has
  never been observed, so which of the two holds is not proven. Options for
  the owner are in §5; none is chosen here.
- Measured on a 4-core cloud container on a clock running 6× faster than
  real time, not on Hetzner. What that does and does not represent is in
  [How it was measured](#how-it-was-measured).

## How it was measured

The real stack (simulation worker thread + gateway main thread, one process,
`apps/realtime-gateway/src/main-merged.ts` shape) from a production build,
`deploy/env/production.env` with `SIMULATION_AI_PLAYER_COUNT=60`, the 900 MB
heap limit, a fresh generated world (640×320, 87,274 land tiles), 60 AI
Houses and 40 bot humans from
`scripts/sector-memory-probe/late-contest-probe.mjs` playing in turns (15–30
minutes on, about four game hours away), as in the soak. Natively on Node 22
(Debian), not in the `node:22-alpine` image: there was no Docker daemon. Heap
figures carry over; process memory does not, and is not used here.

- `clock-warp-preload.cjs` at `PROBE_CLOCK_SCALE=6`: `Date` runs 6× real
  time and timer delays are divided by 6.
- `thread-heap-preload.cjs`: per-thread heap every 10 s and heap snapshots of
  the simulation thread on request.
- Snapshots were ranked by retained size (dominator tree) with a one-off
  streaming analyser (not committed: V8 cannot `JSON.parse` a 300 MB
  snapshot) and diffed by retaining path.

**What the 6× clock does not represent.** The AI command producer times its
own ticks with `Date.now()` (`ai-command-producer-worker.ts`), so at 6× a
9 ms tick reads as 54 ms, over its 50 ms back-off threshold, and the AI
backed off to its slowest setting (1.6–3.2 game seconds between ticks) for
the whole run. The AI therefore acted several times less often per game
hour than in production, and land was taken more slowly: 43k tiles at game
hour 34 against 64k in the soak at the same age. Game-time windows (24-hour
activity logs, AI history caps, manpower regeneration) are reached at the
right game age; anything driven by AI command count is reached later. That
is why the comparison below is per owned tile, and why the soak's real-time
figures are the ones projected from.

### Runs

| Run | Build | World | What for |
|---|---|---|---|
| A | `develop` at `1c4aa531` | fresh, seed 527849956 | Three snapshots as the world aged, game hours 9.7 → 33.9 |
| Old | `develop` | Run A's world at game hour 37, restarted | Baseline for the fix |
| New | this branch | the same copy of run A's world | The fix, same start |

The Old and New runs started from identical copies of run A's database,
side by side on two cores each (Old on cores 0–1, New on 2–3, each with its
own bot humans), and were snapshotted at the same game age after the
restart. A restart rebuilds caches from empty in both, so these are growth
from a common start, not run A's absolute sizes. (A first fresh-world run of
this branch, B, was abandoned: sharing cores with run A, it took land at half
run A's pace and could not be compared. The container also restarted once,
which ended run A at game hour 37; that is where Old and New start.)

## 1. What grows: run A, `develop`

Retained size in MB, simulation thread, from heap snapshots (after GC by
construction).

| Holder | Game hour 9.7 | 21.8 | 33.9 | Growth |
|---|---|---|---|---|
| Owned tiles | 23,245 | 37,478 | 42,739 | +19,494 |
| **Simulation heap, reachable** | **295.6** | **359.8** | **397.5** | **+101.9** |
| Fog: visibility reason tags (`VisibilityCoverageCache.reasons`) | 14.2 | 25.4 | 34.5 | +20.3 |
| Vision footprint memo (`VisionFootprintTable`) | 3.3 | 14.2 | 21.5 | +18.2 |
| AI decision diagnostics (`recentDiagnostics`) | 5.5 | 10.8 | 16.1 | +10.7 |
| Tile-delta last-sent records | 11.2 | 16.0 | 19.6 | +8.4 |
| AI planner tile view (`plannerTilesByKey`) | 5.3 | 9.4 | 10.7 | +5.3 |
| Spawn placement index | 14.5 | 18.3 | 19.0 | +4.5 |
| Fog: coverage refcounts | 2.6 | 4.6 | 6.6 | +4.0 |
| Snapshot tile cache | 11.7 | 14.7 | 15.7 | +4.0 |
| AI planner per-player tile keys | 1.8 | 4.2 | 5.6 | +3.9 |
| Player summaries | 2.8 | 4.8 | 5.6 | +2.8 |
| Activity logs (24 h) | 1.3 | 3.3 | 3.8 | +2.5 |
| Command replay cache | 10.8 | 9.8 | 12.0 | +1.2 |
| Login snapshot cache | 3.0 | 4.6 | 4.1 | +1.1 |
| Live world tiles | 52.6 | 50.8 | 50.2 | −2.4 |

The named holders account for 87 of the 102 MB; the rest is spread thinly
(strings, small objects). Per newly owned tile: 5.3 KB from 9.7 to 33.9 game
hours, 5.0 KB from 21.8 to 33.9 — the same 5.0 KB per tile as the soak.

## 2. Leak or legitimate

| Holder | Grows with | Bound | Verdict |
|---|---|---|---|
| Vision footprint memo | Every tile that was ever a vision source, × every vision radius it was ever seen at | None. Its own comment claimed (world tiles × radii), but radii grow with tech and captures, and nothing was ever dropped | **Leak.** A memo of recomputable results. Fixed (§3) |
| Fog visibility reason tags | Tiles each House can see | Covered tiles × Houses | **Legitimate**, but one Map per tile per House. Made smaller (§3) |
| AI decision diagnostics | AI decisions | 100 per AI House | **Capped**, filling: 5,239 of 6,000 entries at game hour 34, about 3 KB each, so it levels off near 18 MB. Debug only; could be shortened (owner option) |
| Tile-delta last-sent records | Tiles ever sent to anyone | 204,800 tiles | Legitimate; up to about 30 MB on a fully explored map |
| AI planner tile view and per-player keys | Owned tiles | World tiles | Legitimate (the AI's copy of the map) |
| Spawn placement index, player summaries, fog coverage, snapshot tile cache | Owned or settled tiles | World tiles | Legitimate |
| Activity logs | Ownership changes and combat | 24-hour window, 50,000 entries each | Capped; full after the first game day |
| Command replay cache | Client commands | 50,000 commands | Capped |
| Login snapshot cache | Houses, empire size | One per House | Legitimate |

Nothing was found keyed by command, event or finished-work ids without a cap:
the earlier report's replay-cache leak is fixed, and the in-memory event log
is held at 2,000–2,500 entries.

## 3. What this branch changes

All in `apps/simulation`, each with a test that fails without it.

| Change | Files | Effect |
|---|---|---|
| The vision footprint memo is two generations of at most 32,768 entries per tier (permanent / mountain-scoped). A footprint is stored as a packed `Int16Array` instead of an array of `[dx, dy]` arrays (about 64 bytes per cell); the dilation loop reads it through a new allocation-free `forEachOffset`. Each rollover is logged with entry count, bytes and evictions (`simulation vision footprint memo rollover`). | `vision-footprint-memo.ts` (new), `vision-footprint-table.ts`, `visibility-coverage-raster.ts` | Bounded at about 25 MB per tier in the worst case; 1.1 MB against 3.4 MB six game hours after a restart |
| Fog reason tags: reason strings are interned to small ids per cache; a tile tagged only by the House's own territory stores a bare count; any other tile stores an exact-size array of (id, count) pairs, built with `concat()` because `push()` and spread literals reserve about 16 spare slots per array. | `visibility-reason-counts.ts`, `visibility-coverage-raster.ts` | 44.3 → 23.2 MB on the same world; 59 → 27 MB for 184k tiles in a microbenchmark |

Live heap snapshots set the second change: tiles almost always carry two or
three tags (own or ally territory, own or ally reach, relay beacon; 184k
tiles, 67k of them with ally tags), so a first version that only shortened
own-territory-only tiles saved nothing in a run and was replaced.

Regression tests: `vision-footprint-table.test.ts` ("stays bounded however
many distinct (tile, radius) footprints a season touches", "recomputes an
evicted footprint identically", "forEachOffset visits exactly the getOffsets
footprint"); `visibility-reason-counts.test.ts` (no per-tile Map for the tag
mixes seen live; demotion; agreement with a plain refcount model over 20,000
random adds and removes).

## 4. Before and after, same world

Old and New runs, both started from the same copy of run A's world at game
hour 37, snapshotted at the same game age after the restart. Retained size in
MB.

| | Old, +5.9 h | Old, +16 h | New, +5.9 h | New, +16 h |
|---|---|---|---|---|
| Owned tiles | 46,444 | 47,963 | 46,377 | 47,903 |
| **Simulation heap, reachable** | **379.9** | **417.4** | **356.6** | **374.9** |
| Fog-of-war coverage cache, all of it | 54.4 | 64.0 | 33.7 | 38.2 |
| of which reason tags | 44.3 | 51.4 | 23.2 | 26.0 |
| Vision footprint memo | 3.4 | 12.8 | 1.1 | 1.4 |
| AI decision diagnostics | 4.1 | 11.0 | 3.3 | 10.4 |
| Command replay cache | 5.2 | 8.1 | 5.4 | 8.2 |
| Login snapshot cache | 3.9 | 5.9 | 6.1 | 3.7 |

| | Old | New |
|---|---|---|
| Growth, +5.9 → +16 game hours (10.1 h) | +37.4 MB, 3.7 MB/h | +18.3 MB, 1.8 MB/h |
| Of which the two changed holders | +16.5 MB | +3.1 MB |
| AI decision round, 95th percentile, at +16 h | 516 ms | 408 ms |
| Simulation loop delay, 95th percentile, at +16 h | 272 ms | 356 ms |

- The rates here are higher than run A's because every cache restarts empty
  after a restart and refills (AI history, replay cache, footprint memo). Both
  runs pay that equally; the difference between them is the change.
- The old memo grew 3.4 → 12.8 MB in ten game hours on 1.5k new tiles: it
  refills with every tile whose vision is recomputed, at every radius. The
  new one stayed under 1.5 MB, rolling its generations over (logged).
- Reason tags still grow with what each House can see (23 → 26 MB here), at
  about half the old cost per tile.
- Timings are on a shared 4-core container on a 6× clock and differ in both
  directions; they say nothing either way about the cost of recomputing
  evicted footprints (see Not measured).

## 5. Projection to 30 days

From the soak (real time, full AI pace), adjusted by what the fixes removed
here:

| | Before | After (estimate) |
|---|---|---|
| Heap after GC per newly owned tile | 5.0 KB | about 4.0 KB (reason tags −0.5 KB, memo −0.5 KB) |
| Heap after GC, soak day 3 (73.9k tiles) | 470 MB | about 400 MB (reason tags −39 MB scaled to 73.9k tiles, memo −30 to −40 MB) |
| Growth on day 3, at about 300 tiles an hour | 1.5 MB/h | about 1.2 MB/h |
| Land left to take | 13.4k of 87.3k land tiles | same |
| Heap after GC with all land owned | about 540 MB, plus memo growth | about 455 MB |
| Peaks (150–200 MB above heap after GC in the soak) | about 700–740 MB | about 600–650 MB |

Two readings of the same data:

- **Growth stops when the land is full** (what the measurements support: the
  soak's whole day-3 rate is accounted for by land taken, and nothing found
  grows with time without a cap). Then the heap levels off: after these
  changes about 455 MB after GC, peaks about 600–650 MB, about 250 MB under
  the limit. At 300 tiles an hour the land would be full around day 5; in
  practice the rate falls as land runs out.
- **Growth goes on at the day-3 rate** (a straight line, as the soak report
  drew it). After these changes heap after GC reaches 700 MB, where peaks
  reach 900 MB, around day 13 (day 10 before), and 900 MB itself around
  day 20 (day 16 before). That still falls inside a 30-day contest.

A full map has never been run, so the first reading is not proven. Options,
with their costs; none is chosen here:

1. **Do nothing more until a run reaches a full map.** A soak like the
   owner's to land saturation, about 5–7 days at the soak's pace, or a
   resumed world on a faster clock with this branch. Cost: time on the
   owner's machine; no money. Risk: none until launch.
2. **Raise the heap limit as insurance.** `--max-old-space-size` in
   `deploy/env/*.env`. The soak's whole process was 1.25–1.32 GB at day 3 on
   the 4 GB server; 1,400 MB of heap would add at most 500 MB to that, about
   1.8 GB in all, still under half the server. Cost: no money; one line. Risk:
   a real leak would take longer to show and the process would hold more
   memory before it did; the checkpoint watermarks (1,500 MB process, 680 MB
   heap) would need revisiting with it, as 680 MB of heap would then defer
   checkpoints long before the limit.
3. **A shorter contest.** Under the straight-line reading, about 12 days stays
   under 900 MB peaks. Changes the product (`docs/gdd.md` §6).
4. **Cut more legitimate per-tile state.** In order of size at 48k tiles:
   fog reason tags (26 MB, only read by the full-visibility audit export —
   could be built on demand), tile-delta last-sent records (20 MB, up to about
   30 MB at full exploration), AI planner tile view (13 MB), AI decision
   history (levels off near 18 MB; debug only, could keep fewer entries or
   drop `frontierOriginExplanations`, a third of it). Cost: engineering time;
   each needs its own check that nothing reads what is dropped.

## 6. Decision, 2026-11-28 (owner)

Option 2 was taken: `--max-old-space-size` is raised from 900 MB to 1,536 MB in
`deploy/env/production.env`, `staging.env` and `hosted.env`, as insurance.
Under the straight-line reading (§5) simulation heap peaks at day 30 are about
1,380 MB, under the new limit.

**The limit is per thread, not only the simulation's.** `NODE_OPTIONS` applies
to every V8 isolate in the one process that has no `resourceLimits` of its own:
the simulation worker, and also the gateway main thread, the SQLite writer, the
gateway command-store worker and the event-loop watchdog. Each of those can
now grow to 1,536 MB where 900 MB stopped it before. The AI planner (192 MB),
system worker (96 MB), snapshot builder (256 MB) and both stringifiers (96 MB)
keep their own caps. The memory fit below counts only simulation growth, so a
second thread leaking at the same time is not covered by it.

Whole-process memory, simulation growth only: about 1.25–1.32 GB measured on
soak day 3 (in Docker limited to 4 GB on the owner's MacBook, not on Hetzner),
plus up to about 700 MB more simulation heap by day 30, plus about 320 MB per
revealed session while its reveal is built
([`full-reveal-2026-11-23.md`](full-reveal-2026-11-23.md)), plus the
checkpoint build: about 2.4 GB with one reveal. That leaves out the OS, Docker,
Caddy, the hourly backup and the SQLite page cache, which also want memory on
the 4 GB server.

The checkpoint watermarks are raised with it: heap from 680 to 1,300 MB and
process from 1,500 to 2,300 MB. Left at 680 MB, regular checkpoints would be
put off (run only when forced every 4,000 events, which lengthens what a crash
rolls back) once heap peaks passed 680 MB, around day 10–13 on the
straight-line reading. With the new values:

- Late in a contest on the straight-line reading, process memory can still
  pass 2,300 MB, with two or more reveals open at once, and process memory
  rarely shrinks back afterwards. From then on regular checkpoints are put off
  again, as before but about 800 MB later. If growth stops when the land is
  full (peaks about 600–650 MB) neither watermark is reached.
- 1,536 − 1,300 MB is not a precise margin: the limit caps V8's old space,
  while the watermark compares the whole heap in use. The 7–40 MB measured
  for a checkpoint build was process memory on an early-contest world.
- `scripts/ops/hetzner-env-files.test.mjs` now checks that the three env files
  agree and that the heap watermark stays at least 128 MB under the limit.

**Not measured at the new limit.** Every figure here was measured at 900 MB.
With more room V8 collects less eagerly, so heap in use is likely to run
further above heap after GC than the 150–200 MB seen at 900 MB, and the
watermarks may be reached earlier than estimated. A run at 1,536 MB would
show it.

**A full-map run is still wanted** to confirm that growth stops when the land
is full. The higher limit buys time against the straight-line reading; it does
not show which reading is right, and it lets a real leak run longer before it
shows. No alert on simulation heap or on deferred checkpoints was added with
this change; one would shorten that blind spot.

## Not measured

- **Real time, and a real AI pace.** The 6× clock slowed the AI per game hour
  (see above); the soak, not these runs, is the real-time evidence.
- **A full map.** The highest ownership here was 47.5k of 87k land tiles; in
  the soak, 73.9k. Where the 5.0 KB per owned tile goes after the map is
  full — whether churn of captured land adds to anything — was not observed.
- **More than about two game days** of any one world, or a contest end.
- **Hetzner, the Alpine image, a revealed session.** Process memory was not
  compared.
- **CPU cost of the smaller memo.** A footprint evicted and needed again is
  recomputed (an O(radius²) scan); the AI and loop timings of the Old and
  New runs are in §4 but were not a controlled comparison.
- **Repeat runs.** One run of each.

## Reproduce

```bash
pnpm --filter "@border-empires/simulation..." --filter "@border-empires/realtime-gateway..." build
RUN="$PWD/.local-data/heap-growth"; mkdir -p "$RUN"
set -a; . deploy/env/production.env; set +a
unset NODE_ENV HOST PLAY_ORIGIN GATEWAY_EMAIL_ALERTS_APP_URL
export SIMULATION_AI_PLAYER_COUNT=60 PORT=13101 SIMULATION_PORT=13102 SIMULATION_METRICS_PORT=13103 \
  SIMULATION_METRICS_HOST=127.0.0.1 GATEWAY_SIMULATION_WAKE_ADDRESS=127.0.0.1:13102 \
  SIMULATION_SQLITE_PATH="$RUN/be.db" GATEWAY_SQLITE_PATH="$RUN/be.db" PROBE_DIR="$RUN" \
  PROBE_CLOCK_SCALE=6 PROBE_ADMIN_EMAIL=probe-human-1@example.com \
  NODE_OPTIONS="--max-old-space-size=900 --require $PWD/scripts/sector-memory-probe/clock-warp-preload.cjs --require $PWD/scripts/sector-memory-probe/thread-heap-preload.cjs"
taskset -c 0-2 node scripts/sector-memory-probe/launch-stack.mjs &   # wait for "[probe-stack] ready"
NODE_OPTIONS= PROBE_DIR="$RUN" PROBE_PORT_BASE=13101 PROBE_ADMIN_EMAIL=probe-human-1@example.com \
  PROBE_DURATION_S=86400 PROBE_SAMPLE_S=60 taskset -c 3 node scripts/sector-memory-probe/late-contest-probe.mjs &
touch "$RUN/snapshot-request-1"   # heap snapshot of the simulation thread, repeat as the world ages
```

Set `PORT` and friends after sourcing `production.env`, which sets `PORT=8080`.
To restart a world on another build, copy `be.db*` and `clock.json` to a new
directory and start with `PROBE_CLOCK_RESUME=1`.
