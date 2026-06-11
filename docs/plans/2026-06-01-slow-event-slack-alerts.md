# Slow-event Slack alerts — 2026-06-01

> Agent hand-off. Self-contained. Single PR is fine; can split if it
> gets large.

## Why

The user is currently the on-call. When prod degrades (auth waits,
SIMULATION_UNAVAILABLE, SQLITE retries), they only find out because
they tried to play and it failed. By that time the slow window has
been going for minutes.

We already log lots of diagnostic events
(`simulation_ai_worker_slow`, `simulation_lag_diagnostic`,
`QUEUE_PERSIST_FAILED`, etc.) but they live in `fly logs` — nobody
reads them in real time.

Goal: when a slowness/error event fires in prod, post a structured
Slack alert with enough context that the next agent can pick it up
and open a GitHub issue (or fix it directly).

## Scope

**In:**
- Detect a curated set of slow/error events in the prod gateway+sim
- Post to Slack via webhook
- Dedupe (one alert per type per N minutes)
- Include a recent-metrics snapshot so the receiver knows scale

**Out (separate work):**
- Auto-creating GitHub issues (Slack → human → issue is fine for now)
- Pretty dashboards
- Pagerduty escalation

## Architecture

Single new service in the gateway:
`apps/realtime-gateway/src/slack-alerts/slack-alerts.ts`. The sim is the worker
thread; it already emits structured diagnostic logs. Gateway watches
those (it owns the metrics endpoint anyway) and dispatches.

Why gateway and not sim:
- Sim worker is the bottleneck; we don't want to add HTTP egress on
  the hot path.
- Gateway already has the events bus
  (`recentGatewayEvents`, `recordGatewayEvent`).
- One webhook per process is cleaner.

## Events to alert on (start with these 6)

| Trigger | Detection | Severity |
|---|---|---|
| `QUEUE_PERSIST_FAILED` (3+ in 60s) | `recordGatewayEvent` interceptor | high |
| `simulation_wake_exhausted` | gateway log line | high |
| `gateway_command_submit_latency_ms` p99 > 2500ms | poll every 30s | medium |
| `analyze_iter_total` p99 > 500ms | poll sim /metrics every 30s | medium |
| Machine restart (`flyd` start event) | external — Fly webhook OR detect via uptime reset | high |
| `gateway_sqlite_retry_total` rate > 10/min | derivative | medium |

Each fires with these fields:

```
:rotating_light: prod *gateway_command_submit_latency_ms p99 > 2500ms*
*Current:* 3120ms (target <2500)
*Trigger:* exceeded threshold 5 times in last 5 min
*World:* 8024 tiles, 5 AI players, 1 active human
*Recent restarts:* none in last 30 min
*Recent events:* QUEUE_PERSIST_FAILED ×2, SIMULATION_UNAVAILABLE ×8
*Build SHA:* 82a7fbe
*Suggested next agent task:* see docs/plans/2026-06-01-ai-time-budget-cap.md
```

The "suggested next agent task" link should be configurable — start
with a static map of `event → plan-doc`, owner can refine it.

## Implementation

### Step 1 — Slack webhook + secret

- Add `SLACK_ALERT_WEBHOOK_URL` env var (Fly secret in prod, unset on
  staging so staging stays silent).
- `apps/realtime-gateway/src/slack-alerts/slack-alerts.ts` exports
  `createSlackAlerter({ webhookUrl, dedupeWindowMs })`.
- Returns an object with `alert(event)` that fires-and-forgets via
  `fetch` (don't block the gateway main thread on Slack).

### Step 2 — Dedupe

In-memory map of `alertKey → lastSentAt`. If `now - lastSentAt <
dedupeWindowMs (5 min default)`, skip. After window, send and update.

### Step 3 — Wire up the 6 triggers

- `QUEUE_PERSIST_FAILED` and `simulation_wake_exhausted`: hook in
  `recordGatewayEvent`. When event name matches, call alerter.
- Latency thresholds: new timer `setInterval(checkLatencies, 30_000)`
  that reads `gatewayMetrics.snapshot()` and dispatches.
- Machine restart: track gateway process `Date.now() - startupStartedAt`.
  Fire once on the first metrics tick after startup if uptime < 60s.
- `gateway_sqlite_retry_total` rate: keep a 60s ring buffer of
  snapshot values, compute delta/min.

### Step 4 — Context enrichment

Each alert includes:
- Current world tile count (`gateway_snapshot_tile_count`)
- Active WS sessions (`gateway_ws_sessions`)
- AI player count (env)
- Build SHA (already tracked)
- Last 5 entries from `recentGatewayEvents`

### Step 5 — Plan-doc suggestion map

Hard-code initially:
```ts
const SUGGESTED_FIX_BY_EVENT = {
  gateway_command_submit_latency_high: "docs/plans/2026-06-01-ai-time-budget-cap.md",
  analyze_iter_total_high: "docs/plans/2026-06-01-ai-time-budget-cap.md",
  queue_persist_failed: "docs/plans/2026-05-30-fix-queue-persist-failed.md",
  simulation_wake_exhausted: "docs/plans/2026-05-29-ai-planner-cost-cap.md",
  machine_restart: "investigate exit_code; if 137 oom_killed=true, RAM",
  sqlite_retry_high: "docs/plans/2026-05-30-fix-queue-persist-failed.md"
};
```

Owner adds more over time.

## Test plan

- Unit: dedupe map respects window.
- Local: stub webhook with a local HTTP server, fire each trigger
  artificially, assert payload shape.
- Staging: leave webhook unset; confirm no Slack traffic, no errors.
- Prod: set webhook to a test channel first, watch for noise. Tune
  thresholds. Move to real channel.

## What NOT to do

- Don't block gateway main thread on Slack fetch. Always
  fire-and-forget with `.catch(() => {})`.
- Don't include PII in the alert body. Player IDs are fine; emails or
  display names are not.
- Don't alert on every log line — pick the 6 above first, expand
  later based on what's actually useful.
- Don't auto-create GitHub issues yet. The Slack→human→issue loop
  forces a human triage step that catches false positives.

## Tradeoff

- Adds one outbound HTTP dependency. If Slack is down, alerts drop
  silently (acceptable — it's not a hard dependency).
- Slack webhooks are rate-limited (~1/sec); 5-min dedupe handles this.
- Operational overhead: someone has to read the channel. That's a
  human cost the project signs up for.

## Self-review checklist

- [ ] All 6 triggers implemented and tested.
- [ ] Dedupe window respected.
- [ ] No PII in alert body.
- [ ] Fire-and-forget: gateway main thread never awaits Slack.
- [ ] Staging stays silent when webhook is unset.
- [ ] Plan-doc suggestion map is in code, not hardcoded into
      formatter — easy to extend.
