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
- **On the same world, same game age:** reachable heap TBD.
- **Projection:** TBD.
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

TBD

## 5. Projection to 30 days

TBD

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
