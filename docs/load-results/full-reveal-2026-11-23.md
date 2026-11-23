# Full-map reveal and server capacity — 2026-11-23

Status: measurement record (launch gate 1, [`docs/gdd.md`](../gdd.md) §9 and §11)

## Summary

- **The report is confirmed.** One player with the map revealed in a live
  contest degraded the server for everyone.
- **Cause.** Each time anything changed in the revealed player's own view, the
  gateway asked the simulation to export the whole world again and re-sent it:
  38.6 MB, 16 times in 5 minutes, to one client.
- **Fix (this branch).** The simulation now sends a revealed player every tile
  change as it happens. The world is exported once, at the moment of reveal.
- **Capacity.** 100 Houses (60 AI + 40 connected humans) with up to 4 revealed
  sessions ran without stalls on 2 CPU cores, on an early-season world. Late
  season, real Hetzner hardware and humans who actively play were not
  measured. See "Not measured".
- **New finding, not fixed here.** At 100 Houses the process sits above the
  700 MB checkpoint memory watermark before anyone reveals anything, so
  regular checkpoints are deferred.

## How it was measured

The real stack: the simulation in a worker thread and the gateway on the main
thread of one Node process, the same shape as production (`main-merged.ts`),
both from a production build, with a 900 MB heap cap
(`--max-old-space-size=900`, as in `deploy/env/*.env`). Fresh generated world,
640×320 (204,800 tiles). Nothing was deployed and no live environment was
touched.

- `scripts/full-reveal-probe/launch-stack.mjs` starts the stack with a
  throwaway token-signing key, so a probe can log in as the fog admin and as
  any number of humans.
- `scripts/full-reveal-probe/probe.mjs` logs in the admin and N humans, records
  a fogged baseline, sends `REQUEST_REVEAL_MAP` (what the client sends), and
  keeps recording.
- "Tap latency" is a fogged human requesting one of their own tiles: client →
  gateway → simulation → gateway → client.
- Loop stall is the longest event-loop delay: from each process's own metric
  (scraped every 5 s) and, for the gateway, a 1 Hz sampler in the launcher.
- CPU is the whole process as a percentage of one core.

Machine: a 4-core cloud container, not a Hetzner server. The capacity runs were
pinned to 2 cores with `taskset`.

## 1. One revealed player, before and after the fix

Staging settings (`deploy/env/staging.env`), 20 AI Houses, 1 fog admin, 1 fogged
human. 120 s fogged, then 300 s revealed. One run each.

| | Fogged baseline | Revealed, before fix | Revealed, after fix |
|---|---|---|---|
| Sent to the revealed client | 82 KB of updates | 38.6 MB + **16 full resends = 617 MB** | 38.6 MB once + 2.5 MB of updates |
| Full-world exports by the simulation | 0 | 17 | 1 |
| Simulation loop stall, max | 28 ms | **666 ms** | 25 ms |
| Gateway loop stall, max (metric) | 3 ms | **665 ms** | 2 ms |
| Gateway loop stall, max (1 Hz sampler) | 18 ms | 804 ms; 15 separate seconds ≥ 100 ms | 477 ms; 1 second ≥ 100 ms |
| Tap latency for another player, p95 | 7 ms | **157 ms** | 5 ms |
| Tap latency for another player, max | 35 ms | 1,715 ms | 993 ms (one sample) |
| Simulation heap, max (cap 900 MB) | 250 MB | 683 MB | 404 MB |
| Process memory (RSS), max | 570 MB | 1,317 MB | 933 MB |
| CPU, average / peak | 6 % / 40 % | 28 % / 202 % | 11 % / 178 % |
| Checkpoints deferred for memory | 0 | 6 | 2 |

The before and after baselines differ slightly because each run generated its
own world (after-fix baseline: 31 ms simulation stall, 6 ms tap p95, 612 MB).

What is left after the fix is the reveal itself: one 38.6 MB download, about
320 MB of extra memory while it is built and sent, and one moment of up to
about a second where another player's tap is slow.

### Cause, with evidence

`gateway-app.ts` handled a `TILE_DELTA_BATCH` for a fog-disabled player by
scheduling `refreshPlayerFogSnapshot`: a `SubscribePlayer` call with
`fullVisibility: true`, answered with all 204,800 tiles and forwarded to the
client as `TILE_SNAPSHOT_REPLACE`. The simulation only ever sent that player
changes inside their own territory's vision, so resending the world was the
only way the rest of the map stayed current.

The gateway log for the before-fix run shows 58 such triggers coalesced into 16
refreshes in 300 s (the 15 s pacing added on 2026-11-20 held), and the
simulation logged `simulation_snapshot_build_slow` 34 times. The pacing limited
how often it happened, not what each one cost.

### The fix

- Simulation: a revealed player is marked as spectating. The tile-change
  fan-out sends a spectator every change in the batch, unfiltered
  (`tile-delta-fanout-filter.ts`, `subscription-registry.ts`).
- Gateway: a change for a revealed player is forwarded like any other. The
  full-world refresh scheduler is removed. Changes that arrive while the
  initial map is still downloading are held and replayed after its last chunk
  (`reveal-map-stream.ts`).

Regression tests that fail on the old code and pass on the new:
`gateway-fog-restore-race.integration.test.ts` (a world change must not cause a
second full-world request) and `rewrite-stack.integration.test.ts` (real
simulation and gateway: the revealed admin receives the changed tile as a delta
and no second `TILE_SNAPSHOT_REPLACE`).

## 2. Capacity, after the fix

Production settings (`deploy/env/production.env`) except
`SIMULATION_AI_PLAYER_COUNT=60`. Pinned to 2 cores. 40 humans joined the
contest, each tapping one tile every 5 s and doing nothing else. That is 100
Houses. One run each, on the same world, the second straight after the
first.

| | Fogged, 100 Houses | + 1 revealed session | + 4 revealed sessions |
|---|---|---|---|
| Duration | 120 s | 240 s | 240 s |
| Tap latency p95 / max | 67 / 85 ms | 56 / 70 ms | 53 / 84 ms |
| Simulation loop stall, max | 72 ms | 63 ms | 154 ms |
| Gateway loop stall, max (metric) | 9 ms | 22 ms | 10 ms |
| Gateway loop stall, max (1 Hz sampler) | 41 ms | 459 ms; 1 second ≥ 100 ms | 867 ms; 4 seconds ≥ 100 ms |
| Simulation heap, max (cap 900 MB) | 442 MB | 415 MB | 654 MB |
| Process memory (RSS), max | 850 MB | 1,167 MB | 1,478 MB |
| CPU, average / peak (of one core) | 16 % / 70 % | 23 % / 148 % | 32 % / 154 % |
| Humans disconnected or errored | 0 | 0 | 0 |

All 40 humans received land. All 4 reveals completed.

Reading this:

- CPU is not the constraint at this stage of a contest: about a third of one
  core on average with 4 revealed sessions.
- Memory is the tighter one. Four reveals in 20 s took the simulation heap to
  654 MB of its 900 MB cap. Each reveal rebuilds the full export, because any
  tile change invalidates the gateway's cached copy. More simultaneous reveals
  were not tried.
- The gateway stalls of 0.5–0.9 s are the reveal downloads being serialized.
  They happen once per reveal, not continuously.

### Checkpoints are deferred at 100 Houses

`SIMULATION_CHECKPOINT_MAX_RSS_MB=700`. With 100 Houses the process was at
816–869 MB before any reveal, and the simulation logged `simulation checkpoint
deferred due to memory watermark` 8 times in about 9 minutes. Deferred
checkpoints are forced after `SIMULATION_CHECKPOINT_FORCE_AFTER_EVENTS=4000`
events. What that costs at restart (replay time) was not measured. It needs a
decision before a 100-House contest: raise the watermark, or bring baseline
memory down.

## Not measured

- **Real Hetzner hardware.** Production is a CX23. These numbers are from a
  different machine limited to 2 cores; shared-vCPU performance and the 4 GB
  memory limit were not reproduced. No conclusion about a specific server price
  is drawn here.
- **A late-season world.** Every run started from a fresh world and lasted
  minutes. Territory, structures and tile changes per second all grow over a
  contest. This is the largest gap.
- **Humans who play.** The 40 humans only tapped a tile. No expansion, combat,
  building or diplomacy load from humans. The AI Houses did play.
- **More than one revealed account.** Only the admin account may reveal during
  a live contest, so "4 revealed" is 4 sessions of that one account.
- **Everyone revealed after a contest ends.** That path is separate (overview
  plus viewport detail) and was measured on 2026-11-08
  (`season-reveal-staging-2026-11-08.json`). It was not re-run.
- **The browser.** Whether the client stays smooth while it receives and draws
  the revealed map was not measured. Before the fix it was parsing 38.6 MB
  about every 19 s.
- **Network.** Everything ran on loopback.
- **Hours of soak, and repeat runs.** Each figure is from a single run.

## Reproduce

```bash
pnpm --filter @border-empires/simulation build
pnpm --filter @border-empires/realtime-gateway build

mkdir -p .local-data/probe
set -a; . deploy/env/staging.env; set +a      # or production.env
unset NODE_ENV HOST PLAY_ORIGIN GATEWAY_EMAIL_ALERTS_APP_URL
export PORT=13101 SIMULATION_METRICS_HOST=127.0.0.1 \
  SIMULATION_SQLITE_PATH="$PWD/.local-data/probe/be.db" \
  GATEWAY_SQLITE_PATH="$PWD/.local-data/probe/be.db" \
  PROBE_DIR="$PWD/.local-data/probe"
taskset -c 0,1 node scripts/full-reveal-probe/launch-stack.mjs &   # wait for "[probe-stack] ready"

PROBE_DIR="$PWD/.local-data/probe" PROBE_BYSTANDERS=40 PROBE_DETAIL_INTERVAL_MS=5000 \
  PROBE_REVEALERS=1 PROBE_BASELINE_S=120 PROBE_REVEAL_S=240 \
  PROBE_OUTPUT="$PWD/.local-data/probe/report.json" \
  node scripts/full-reveal-probe/probe.mjs
```
