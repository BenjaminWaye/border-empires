# A longer 100-House contest on a small server — 2026-11-24

Status: measurement record (launch gate 1, [`docs/gdd.md`](../gdd.md) §9 and §11)

Follows [`sector-memory-2026-11-23.md`](sector-memory-2026-11-23.md) and
[`full-reveal-2026-11-23.md`](full-reveal-2026-11-23.md). Those stopped at 100
minutes, on Debian's C library, with humans who only tapped a tile.

## Answer

**Can one CX23 (2 vCPU, 4 GB) run one standard 100-House sector for a full
contest? Not shown. It ran the first nine game hours with room to spare on the
server, and the trend says a setting, not the server, gives out first.**

- **Server memory is not the limit.** The process used 1.1 GB after 100
  minutes and 1.2–1.3 GB on a world with about nine game hours of play. That
  leaves about 2.7 GB of the 4 GB, before the operating system, Docker and
  Caddy, which were not measured.
- **The simulation's own heap limit is.** The simulation may use 900 MB of
  heap (`--max-old-space-size=900`); past that the process dies. After nine
  game hours it held about 490 MB that garbage collection could not free and
  peaked at 685 MB, 215 MB under the limit. It was still rising when the runs
  ended. Nothing here shows where it stops.
- **CPU is fine at this age.** About 38 % of one core on average and 100 % at
  the 95th percentile, of the two cores available.
- **The 1,250 MB checkpoint watermark holds early, not later.** On the
  nine-hour world the process passed 1,250 MB after about 20 minutes of running
  and a third of checkpoints were put off again.
- **How far this goes.** About nine game hours of a contest that can last 30
  days, which is about 1 %. The cloud container these ran on restarts itself
  every hour or two, so a multi-day run is not possible here. See
  [What is needed next](#what-is-needed-next).

## What was run

Everything ran inside the production base image, `node:22-alpine` (Node
22.23.5, musl allocator), limited to 2 cores and 4 GB, from a production build
with `deploy/env/production.env` except `SIMULATION_AI_PLAYER_COUNT=60` and the
watermarks named per run. It is the base image with this checkout's build
mounted into it, not an image built from `Dockerfile.combined`. Fresh 640×320
worlds. Nothing was deployed and no live environment was touched.

100 Houses: 60 AI and 40 humans. The humans are bots that send real commands
through the gateway: claim, attack, muster, garrison, build, research, alliance
and truce offers, and viewport moves, one command every 6 seconds each. Each
drops its connection and logs in again about every 15 minutes. Most of what
they send is refused by the rules (not enough manpower, tech not affordable),
as it would be for a player mashing buttons; in the real-time run 2,662
attacks and claims were accepted. They are not good players: their Houses grew
to a median of about 220 tiles while the largest AI House reached 1,372.

**All 40 humans were online for the whole of every run. Real players are not**
(owner, 2026-11-24): a player takes a turn of 15–30 minutes and comes back
about four hours later, when manpower has refilled. That puts 3 or 4 of 40
online at a time, not 40. So the human load in these runs is about ten times
what a real contest would see. CPU, tap round trips and bytes sent are
overstated by it. Memory is mostly the AI Houses and the world, and is not
expected to drop much; that has not been measured. The probe now plays in
turns by default (`PROBE_SESSION_MIN_S`, `PROBE_SESSION_MAX_S`,
`PROBE_AWAY_S`), and the long run below uses that.

| Run | Clock | World | Length | Watermarks (process / heap) |
|---|---|---|---|---|
| A | real time | fresh, humans only tap (the old probe) | 45 min | 1,250 / 480 |
| B | real time | fresh, humans play, map revealed at minute 30 | 103 min | 1,250 / 480 |
| C | 6× then 3× | fresh, humans play | 33 + 103 real minutes = 3.1 + 5.1 game hours | 1,250 / 650 |
| D | real time | C's world, restarted | 34 min, graceful stop, then 15 min with a reveal | 1,250 / 680 |

### How the older world was made, and what that does not represent

The repository has no faster clock, no prepared late world, and a contest ends
only by victory. A real-time run cannot reach a late contest in the time
available here, so run C used a new preload,
`scripts/sector-memory-probe/clock-warp-preload.cjs`, that makes the whole
process see time pass 6 or 3 times faster. Run D then restarted that world on a
normal clock and measured it.

What that world is not:

- **Not 30 days.** 8.2 game hours on the fast clock plus 0.8 in run D.
- **The AI played less per game hour than it really does.** The AI slows its
  own decision loop when a decision round takes long, and on the fast clock
  every round looks 3 or 6 times longer. Its loop ran at 800–1,600 ms instead
  of 200 ms. Run C recorded 254,000 events in 8.2 game hours; run B recorded
  140,000 in 1.7. Per game hour that is under 40 % of the real rate. So the
  world is older in clock terms (research, income, truces) than in the amount
  of play.
- **Less land is owned than in the real-time run:** 45,000 tiles against
  49,000. Run B's AI Houses spread faster.
- **It sat idle twice.** The container was restarted under run C twice. The
  world was down for about 4 and 1 game hours and recovered from its
  database each time.
- Memory and CPU **rates** from run C itself are not production rates and are
  not used below. Only run D's are.

## 1. Checkpoints and the watermarks

A regular checkpoint is due every 1,000 events. It is put off while the whole
process is above `SIMULATION_CHECKPOINT_MAX_RSS_MB` or the simulation's heap
in use is above `SIMULATION_CHECKPOINT_MAX_HEAP_USED_MB`, and forced at 4,000
events.

| Run | Checkpoints saved | Put off | Forced at 4,000 | Events between saves, median / worst | Seconds between saves, median / worst |
|---|---|---|---|---|---|
| A: 1,250 / 480, tapping humans | 44 | 0 | 0 | 1,001 / 1,039 | not recorded |
| B: 1,250 / 480, playing humans | 99 | 42 | 2 | 1,006 / 4,017 | 39 / 226 |
| D first 34 min: 1,250 / 680, older world | 21 | 10 | 3 | 1,005 / 4,011 | 68 / 301 |
| D after restart, 15 min: 1,250 / 680 | 9 | 0 | 0 | 1,002 / 1,024 | 72 / 79 |

**Raising the process watermark alone is not enough.** In run A it looked
enough: nothing was put off, though the heap at checkpoint time reached 435 MB
of the 480 allowed. Once humans played (run B) the heap watermark put off 40 of
142 attempts from minute 25 on. The other two were the process passing
1,250 MB for about a minute while the map was revealed.

**The heap watermark.** The simulation's heap in use at every checkpoint
attempt, and how many attempts each limit would have put off:

| Heap limit | Run A (45 attempts) | Run B (142) | Run C (about 250) | Run D (39) |
|---|---|---|---|---|
| 480 MB | 0 | 40 | 106 | 37 |
| 560 MB | 0 | 2 | 49 | 23 |
| 600 MB | 0 | 2 | 19 | 16 |
| 640 MB | 0 | 1 | 3 | 5 |
| 680 MB | 0 | 0 | 0 | 0 |

The highest heap seen at an attempt was 668 MB (run D), 653 MB during run B's
reveal. 680 MB is the smallest of these limits that put off nothing in any
run; it is 220 MB under the 900 MB heap limit. Run D ran with 680 and no
checkpoint was put off for heap. This is a guard that now almost never fires:
the heap would have to be within 220 MB of the limit that kills the process.

**The process watermark.** Process memory at checkpoint attempts:

| | Run A | Run B | Run D first 34 min | Run D after restart |
|---|---|---|---|---|
| Median | 784 MB | 1,060 MB | 1,230 MB | 1,195 MB |
| Highest | 888 MB | 1,261 MB | 1,302 MB | 1,241 MB |
| Attempts at or above 1,250 MB | 0 | 3 | 13 of 30 | 0 of 9 |
| Attempts at or above 1,500 MB | 0 | 0 | 0 | 0 |

On the older world 1,250 MB is where the process sits, so checkpoints are put
off about one time in three and the worst gap between saves was 5 minutes. A
restart drops memory by about 100 MB for a while, which is why the last 15
minutes were clean. The highest process memory in any run was 1,371 MB (run C).
A watermark of 1,500 MB would have put off nothing anywhere. Changing the
1,250 figure is the owner's decision; it has not been changed.

**Graceful stop** (not measured before): stopping run D saved its final
checkpoint in 0.23 s and the whole stop took 0.28 s. The restart replayed no
events and was ready in 16 s. After a hard stop (the container restart under
run C) the same world replayed 3,002 events in 1.9 s and was ready in 29 s.

## 2. Memory over time

Run B, real time, fresh world. Ten-minute averages.

| Minutes | Process memory | Simulation heap, average | Heap left after garbage collection | Land owned (of about 87,000 land tiles) |
|---|---|---|---|---|
| 0–10 | 599 MB | 244 MB | 190 MB | 8 % |
| 10–20 | 803 MB | 348 MB | 251 MB | 37 % |
| 20–30 | 986 MB | 435 MB | 349 MB | 46 % |
| 30–40 (reveal at 30) | 1,179 MB, peak 1,264 | 479 MB, peak 650 | 363 MB | 49 % |
| 40–50 | 1,061 MB | 450 MB | 390 MB | 52 % |
| 60–70 | 1,068 MB | 462 MB | 404 MB | 55 % |
| 80–90 | 1,077 MB | 467 MB | 410 MB | 56 % |
| 100–103 | 1,085 MB | 469 MB | 417 MB | 56 % |

"Heap left after garbage collection" is the lowest reading in the window, the
closest these runs get to what the simulation really holds.

Run D, the older world on a real-time clock:

| Minutes | Process memory | Simulation heap, average / peak | Heap left after garbage collection |
|---|---|---|---|
| 0–5 | 1,132 MB | 532 / 653 MB | 391 MB |
| 10–15 | 1,211 MB | 567 / 660 MB | 467 MB |
| 20–25 | 1,240 MB | 585 / 684 MB | 489 MB |
| 30–34 | 1,282 MB | 575 / 674 MB | 495 MB |

**Does it level off?** Mostly, and not completely.

- Land ownership levels off within an hour, at 52–56 % of land.
- Process memory then flattens: 1,061 MB at minute 40, 1,085 MB at minute 100,
  about 25 MB an hour.
- What the simulation holds does not flatten: 390 MB at minute 40, 417 MB at
  minute 100, about 27 MB an hour, with land ownership almost still. On the
  older world it was 490 MB.
- Read together: something other than territory grows slowly with play. At
  27 MB an hour the heap would reach its 900 MB limit in well under a day; the
  older world, which had three times the clock time but less play, was only
  80 MB higher, so the growth is not steady in clock time. These runs cannot
  say whether it stops, and what holds it was not looked at (no heap snapshot
  was taken of the older world).

Outside the simulation: the gateway and the seven helper threads held
180–270 MB of heap between them, and 170–215 MB was outside any heap.

## 3. Tick time, CPU and what a player feels

Real-time runs only, 2 cores.

| | Run B, fresh, minutes 40–103 | Run D, older world |
|---|---|---|
| CPU, average (of one core; 200 % is both) | 37 % over the run | 38 % |
| CPU, 95th percentile / highest second | 97 % / 170 % | 105 % / 171 % |
| Seconds at 150 % or more | 16 of 6,170 | 9 of 2,671 |
| AI decision round, 95th percentile | 10–15 ms | 8–22 ms |
| AI loop interval (200 ms is full speed) | 200 ms | 200 ms |
| Simulation loop delay, 95th percentile | 18–88 ms | 13–153 ms |
| Longest simulation stall in a minute | 0.3–0.75 s | 0.1–0.85 s |
| Checkpoint build, 95th percentile | 0.55 s | 0.65 s |
| Tap round trip for a player, 95th percentile | about 300 ms | 80–360 ms, 660 ms just after restart |
| Tap round trip, worst | 0.9 s | 1.2 s |
| Events per minute | about 1,350 | about 880 |

- The AI kept its full pace throughout; it was never throttled for load.
- A tap is slower than in the earlier reports (53–67 ms at the 95th
  percentile there). The difference is 40 humans sending commands. No tap
  timed out.
- No human was disconnected by the server and no reconnect failed (226
  reconnects in run B, 48 in run D). A login took 0.17 s at the median and
  0.7 s at the 95th percentile.
- **Reveal.** Run B at minute 30: 39.5 MB delivered in 8.3 s; the process
  peaked at 1,264 MB and the simulation heap at 650 MB; one gateway stall of
  1.4 s. Run D on the older world: 39.7 MB in 5.5 s, process peak 1,201 MB,
  simulation heap peak 661 MB. One revealed session each time, kept open while
  everything else carried on.
- The database was 50 MB after run B and 81 MB after run D.

## Not measured

- **A late contest.** Nine game hours of up to 30 days. No contest end, no
  rollover.
- **Real Hetzner hardware.** A cloud container limited to 2 of its cores is
  not a shared-vCPU CX23. Disk and network were local.
- **The image CI builds.** Same base image and Node version, not the
  `Dockerfile.combined` build.
- **Real players.** Bots, with poor play, all online all the time instead of
  in turns; more than 40 humans; 50 humans with 50 AI.
- **More than one revealed session** on the older world, or a reveal while
  process memory is already at its highest.
- **What holds the slowly growing heap.** No heap snapshot of the older world.
- **Repeat runs.** One run each. Each fresh run generated its own world.
- **The per-player rollback after a crash.** Still taken from the code.

## What is needed next

The remaining question is whether the simulation heap stops growing, and only a
run of days answers it. That needs the owner:

1. **A run of days on the owner's MacBook** (owner, 2026-11-24). One command,
   from a checkout with `pnpm install` done and Docker Desktop running with at
   least 2 CPUs and 5 GB:

   ```bash
   scripts/sector-memory-probe/soak.sh .local-data/soak 72
   ```

   It runs the stack in `node:22-alpine` on 2 cores and 4 GB with 60 AI Houses
   and 40 humans playing in turns, keeps the Mac awake, stops cleanly on
   Ctrl-C and writes `.local-data/soak/summary.json`. Run again with the same
   directory, it carries on with the same world. A MacBook is not a CX23: an
   Apple-silicon Mac runs the arm64 build of the image on faster cores, so
   memory carries over and CPU does not. `PROBE_REVEAL_AFTER_S=3600` in front
   of the command adds one revealed session.
2. **A decision on the process watermark** now that 1,250 MB is known to be
   reached within nine game hours. 1,500 MB would have put off nothing in
   these runs.
3. **A decision on the 900 MB heap limit.** The server has about 2.7 GB
   unused. Raising the limit is one line in `deploy/env/*.env`, but it moves
   the wall without showing where memory stops, and it should be tested by
   the same long run.

## Reproduce

```bash
pnpm --filter @border-empires/simulation build
pnpm --filter @border-empires/realtime-gateway build
RUN="$PWD/.local-data/late-contest"

# Stack in node:22-alpine, 2 cores, 4 GB. Add PROBE_CLOCK_SCALE=3 to age a world,
# and PROBE_CLOCK_RESUME=1 to restart an aged one on a normal clock.
scripts/sector-memory-probe/run-stack-in-image.sh "$RUN" SIMULATION_AI_PLAYER_COUNT=60 \
  PROBE_ADMIN_EMAIL=fog-admin@example.com > "$RUN/stack.log" 2>&1 &   # wait for "[probe-stack] ready"

# PROBE_AWAY_S=0 keeps every human online, as in the runs above.
NODE_OPTIONS= PROBE_DIR="$RUN" PROBE_HUMANS=40 PROBE_DURATION_S=6000 PROBE_SAMPLE_S=60 \
  PROBE_AWAY_S=0 PROBE_REVEAL_AFTER_S=1800 node scripts/sector-memory-probe/late-contest-probe.mjs

docker stop -t 60 be-probe-13101        # graceful stop
node scripts/sector-memory-probe/summarize-run.mjs "$RUN" 10
```

On a scaled clock the gateway's timeouts shrink with it; run C multiplied
`GATEWAY_SIMULATION_*_TIMEOUT_MS` and `SIMULATION_HEALTH_PROBE_TIMEOUT_MS` by
the scale. A world first joined without `PROBE_REVEAL_AFTER_S` has no fog
admin; pass `PROBE_ADMIN_EMAIL=probe-human-1@example.com` to both scripts to
reveal on it.
