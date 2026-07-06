# Combined-Stack Admin & Metrics Access

Covers `border-empires-combined` (prod) and `border-empires-combined-staging`
(staging) — the single Fly app that runs gateway + simulation together.
Replaces `docs/rewrite-phase5-observability-runbook.md`, which described the
old split `border-empires-gateway` / `border-empires-simulation` Fly apps.
Those apps no longer exist; everything below targets the combined app.

## Public, unauthenticated endpoints

- `GET /health` / `GET /healthz` — liveness only (O(1), never touches the
  event loop or sim RPC). Not a perf signal.
- `GET /metrics` — gateway-only Prometheus series, no auth required.
- `GET /admin/runtime/debug-bundle` — recent server events, attack debug,
  attack traces. No auth required.
- `GET /hq/summary`, `GET /season`, `GET /hq/archives` — season/leaderboard
  data (tiles, income/min, techs, score per player). No per-player gold —
  use the token-gated `/admin/players` below for that.

## Token-gated endpoints

- `GET /admin/runtime/metrics` — gateway series **plus** simulation series
  proxied from the sim's internal-only loopback `:50052/metrics`. This is the
  one scrape URL that lets you compare AI-on vs AI-off runs from a laptop
  without `flyctl ssh`-ing in.
- `GET /admin/runtime/dashboard` — HTML view of the same data.
- `GET /admin/players` — per-player stats including gold, which
  `/hq/summary` doesn't expose: `{ id, name, isAi, gold, settledTiles,
  ownedTiles, incomePerMinute, techs, manpower, food, iron, crystal,
  supply }`, for every player (including barbarians, not just competitive
  players). `settledTiles` counts `SETTLED`-state tiles only; `ownedTiles`
  also counts `FRONTIER`-state tiles. `food`/`iron`/`crystal`/`supply` are
  current strategic-resource stockpiles (SHARD is tracked separately and
  not included here). Source: `runtime.exportPlayerDebugSnapshot()`, the
  same cheap per-player summary path `/hq/summary` uses — no full tile
  export.

All three require either:

```
Authorization: Bearer <ADMIN_API_TOKEN>
```

or a `?token=<ADMIN_API_TOKEN>` query param (added so the dashboard page can
hit the endpoint from a plain `fetch` without CORS-preflight friction).

Auth check lives in `apps/realtime-gateway/src/http-routes/http-routes.ts`
(`adminRequestAuthorized`).

### Getting the token

`ADMIN_API_TOKEN` is a Fly secret — it is **not** in the repo or in any local
dotfile. Pull it from the running container:

```bash
flyctl ssh console --app border-empires-combined-staging -C "printenv ADMIN_API_TOKEN"
```

Then:

```bash
TOKEN=$(flyctl ssh console --app border-empires-combined-staging -C "printenv ADMIN_API_TOKEN" 2>/dev/null | tail -1)
curl -s -H "Authorization: Bearer $TOKEN" \
  https://border-empires-combined-staging.fly.dev/admin/runtime/metrics
```

Swap the app name for `border-empires-combined` to hit prod.

## What's actually in the metrics

Useful series for "is the AI stuck / what is it doing" questions:

- `sim_ai_last_command_accepted_at_ms{player_id="ai-N"}` — per-player
  freshness. Compare to current time; a stale value means that AI is frozen.
- `sim_ai_command_total{type="EXPAND"|"SETTLE"|"ATTACK"|...}` — command
  counts by type across all AI players combined (not split per player).
- `sim_ai_autopilot_player_count`, `sim_ai_autopilot_enabled` — AI on/off.
- `sim_ai_planner_breaches`, `sim_ai_narrow_analyze_capped_total{playerId=}` —
  planner budget pressure per player.
- No `gold`/treasury gauge is exported via Prometheus. For per-player gold,
  use `GET /admin/players` (above) instead of `flyctl ssh`-ing into SQLite.

Simulation-only metrics (not proxied, loopback-only, useful when already
`flyctl ssh`'d in):

```bash
flyctl ssh console --app border-empires-combined-staging \
  -C "wget -qO- http://127.0.0.1:50052/metrics"
```

## Local dev (no Fly, no auth)

When running the stack locally, gateway and sim metrics are open on
loopback, no token needed:

- Gateway: `http://127.0.0.1:3101/metrics`
- Simulation: `http://127.0.0.1:50052/metrics`

## Alert wiring

`scripts/rewrite-phase5-alert-check.mjs` still works, but must be pointed at
the combined app's log stream (the old `-a border-empires-gateway` /
`-a border-empires-simulation` invocations no longer resolve to anything):

```bash
flyctl logs -a border-empires-combined-staging | node scripts/rewrite-phase5-alert-check.mjs gateway
flyctl logs -a border-empires-combined-staging | node scripts/rewrite-phase5-alert-check.mjs simulation
```

Set `SLACK_WEBHOOK_URL` or `PHASE5_ALERT_SLACK_WEBHOOK` to post the first
breach per process to Slack; `PHASE5_ALERT_LABEL` to identify the
environment.

Thresholds:

- `gateway_event_loop_max_ms > 100` for 3 consecutive samples.
- `sim_human_interactive_backlog_ms > 500`.
- `sim_checkpoint_rss_mb > 400`.

## Nightly load harness

```bash
node scripts/rewrite-load-harness.mjs
```

Writes a dated result file to `docs/load-results/YYYY-MM-DD.json`. Drives
synthetic frontier load via `scripts/rewrite-local-soak.mjs` for 30 minutes
against `GATEWAY_METRICS_URL` / `SIMULATION_METRICS_URL` (default
`127.0.0.1:3101` / `127.0.0.1:50052`, i.e. a locally running stack, not Fly
directly). Last dated run on file is `docs/load-results/2026-04-22.json` —
treat this harness as dormant until someone re-runs it.
