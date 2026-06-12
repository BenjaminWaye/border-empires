# AI time-budget cap (50ms) — 2026-06-01

> Agent hand-off. Single-or-split PR. Read all of it.

## Why

Prod degraded into an auth-impossible state on 2026-05-31. Same code, same
hardware, same active human count (1) as staging. The structural cause:
AI per-tick work occupies the sim main thread to the point that auth
gRPCs (`preparePlayer`, `subscribePlayer`) can't complete in their 10s
timeout window. PR #455 capped the inner analyze loop; the **other
planner phases** (`sync_players_*`, relevance scan, unseen-tile scan,
state export) were not capped and at prod's tile density they alone
fully load the sim worker.

Existing precedent: `ai-command-producer-worker.ts:702` already does
`if (humanBacklogNonEmpty) return;` — AI ticks no-op when human commands
are queued. Extend that pattern with a time-budget check.

## Goal

AI never consumes more than **50ms of sim worker time per 200ms tick
window** (25% capacity). Auth gRPCs always have ≥75% of the worker
free. Login latency stays under 2 seconds at any world size.

## Three layered defenses (ship as one PR, all three together)

### Layer 1 — Adaptive tick interval

Currently AI tick fires every 200ms unconditionally. Change to:

```ts
let nextTickDelayMs = options.aiTickMs ?? 200;
const MIN_TICK_MS = 200;
const MAX_TICK_MS = 3200; // 16x backoff ceiling

// inside tick(), measure duration; at end:
const tickDurationMs = now() - tickStartedAt;
if (tickDurationMs > 50) {
  nextTickDelayMs = Math.min(MAX_TICK_MS, nextTickDelayMs * 2);
} else if (tickDurationMs < 25 && nextTickDelayMs > MIN_TICK_MS) {
  nextTickDelayMs = Math.max(MIN_TICK_MS, nextTickDelayMs / 2);
}
clearInterval(intervalHandle);
intervalHandle = setInterval(() => void tick(), nextTickDelayMs);
```

This self-throttles when AI work goes slow.

### Layer 2 — Rolling time-budget per second

In `simulation-service.ts`, track cumulative AI time in a 1-second
sliding window. Inside the `onTick` handler that already receives
`{ durationMs }`, accumulate into a ring buffer. Expose a function
`aiBudgetAvailable(): boolean` that returns false when the last
1000ms of AI work exceeds 200ms (i.e. >20% of wall clock).

Pass `shouldRun: aiBudgetAvailable` to `createWorkerAiCommandProducer`
— the existing `shouldRun` hook already short-circuits `tick()` at
the top of the function.

### Layer 3 — Event-loop-lag observer

The sim already has `simEventLoopMaxMs` metric. Add a precondition in
`tick()`: if `process.hrtime.bigint()`-based recent loop delay >20ms,
return early. The sim main thread is already under pressure — don't
add to it.

Hook this in the same `shouldRun` check from Layer 2.

## What changes

**File-by-file:**

1. `apps/simulation/src/ai/ai-command-producer-worker.ts`
   - Layer 1: replace fixed `setInterval` with self-rescheduling
     `setTimeout` chain; measure tick duration; adjust next delay.
   - Don't break existing `humanBacklogNonEmpty` check — it stays.

2. `apps/simulation/src/simulation-service/simulation-service.ts`
   - Layer 2: build the rolling-window budget tracker; pass as
     `shouldRun` to `createWorkerAiCommandProducer` (~line 1487).
   - Layer 3: include event-loop-lag check in the same `shouldRun`.

3. `apps/simulation/src/metrics/metrics.ts`
   - New counters:
     - `sim_ai_tick_throttled_total{reason="adaptive"|"budget"|"loop_lag"}`
     - `sim_ai_current_tick_interval_ms` (gauge)
   - Helps tune thresholds without redeploys.

## What NOT to do

- Do not change the planner internals (PR #455 already shipped those).
- Do not raise/lower the existing `analyze_iter` cap.
- Do not touch the AI worker side — all changes are sim-main-thread.
- Do not make the budget so aggressive that AI never runs in steady
  state. 50ms/tick × 5 ticks/sec = 250ms of AI work per second is
  fine for an empty sim worker.

## Validation

- Unit tests: simulate a tick that takes 100ms → next interval doubles.
  Simulate a quiet tick → interval halves back. Budget tracker says
  unavailable after 300ms of work in 1s, available after 1s idle.
- Staging deploy: AI behavior should be indistinguishable (staging is
  under budget normally). Metrics: `sim_ai_tick_throttled_total`
  should stay near zero on staging.
- Prod deploy: `sim_ai_tick_throttled_total` should fire frequently
  during dense-world windows. Auth latency drops below 2s.
- Behavioral check: confirm AI players still make moves on prod (rate
  metric: `sim_ai_command_total{type="EXPAND"}` should keep climbing,
  just slower).

## Tradeoff to surface in PR

- AI players move slower at prod scale. Acceptable — humans are
  blocked otherwise. Could become noticeable as "AI feels asleep" if
  the budget is too tight; tune via the metric.
- If all three layers fire simultaneously, AI tick interval could
  back off to 3.2 seconds. AI still runs, just at 1/16th speed.

## Self-review checklist

- [ ] All three layers present in one PR.
- [ ] Existing `humanBacklogNonEmpty` short-circuit preserved.
- [ ] New counters registered + emitted.
- [ ] Tests cover each layer's threshold logic.
- [ ] PR body cites this plan + PR #455 as parent.
