# AI planner cost cap — 2026-05-29

> Agent hand-off. Self-contained. Read all of it.

## Why

Prod is unplayable when empires grow past ~500 owned tiles. Measured at
prod scale right now:

- `request_plan_round_trip` p99 = **2165ms** (target: <50ms)
- `planner_total` p99 = **879ms** (target: <20ms)
- `planner_choose_frontier` p99 = **648ms** (target: <10ms)
- `sim_ai_planner_breaches` = **1540** in 50 min uptime

Staging at half the empire size: p99 < 50ms, 9 breaches. So this is
**cost-scales-with-empire-size**, not a bug.

`ai-spatial-focus.ts` already caps BFS at 256 tiles per refresh. That
cap holds, but each scoring pass still allocates and re-evaluates every
candidate from scratch every tick.

## Goal

Per-AI per-tick planner cost becomes **O(1) in empire size**. AI
behavioral quality stays the same or improves (more thinking budget
spent on candidates that actually changed, less on re-scoring the same
tiles).

Hard targets:
- `request_plan_round_trip` p99 < 50ms at any empire size
- `planner_total` p99 < 20ms
- Zero `sim_ai_planner_breaches` under normal play

## Strategy (read this before writing code)

Four moves, in this order:

1. **Measure first.** Add per-loop instrumentation inside
   `analyzeOwnedFrontierTargetsFromLookup` (frontier-command-planner.ts)
   to identify the actual hot loop. Hypothesis: it's the per-candidate
   neighbor lookups. **Do not optimize anything until the measurement
   PR ships and runs in prod for 24h.** Without numbers you'll
   accidentally pessimize.

2. **Per-tile score cache.** Each frontier candidate's score depends on
   (tile state, neighbor ownership, player econ context). Key the
   cache on `(tileKey, terrainEpoch, ownershipVersion, playerEconEpoch)`.
   First plan after a relevant change: re-score. Subsequent plans:
   read from cache.

3. **Frontier heap, not full scan.** Maintain a per-AI sorted heap of
   scored candidates. Ownership change in the empire triggers
   incremental heap updates (insert/remove/re-score affected tiles
   only). Reading the top candidate is O(1); maintaining the heap is
   O(log N) per ownership change.

4. **Hard time budget.** Wrap every plan request in a 10ms budget. If
   exceeded, log a breach and return best-so-far from the heap. Safety
   net; should rarely fire after #2 and #3.

**Quality preservation principle:** never truncate the *set* of
candidates scored. Truncate the *frequency* with which we re-score
already-evaluated candidates. The AI still sees every tile, just not
every tick.

## Ship as 4 PRs in order

### PR 1 — Measure

**Scope only:**
- Add timing histograms inside `frontier-command-planner.ts`:
  `analyze_iter_total`, `analyze_per_candidate`,
  `analyze_neighbor_lookups`, `analyze_score_calc`.
- Emit via `simulationMetrics.observeSimAiPlannerPhaseMs(...)` (existing
  pattern in ai-planner-worker.ts:372–376).
- No behavior change. No caching yet.

**Validation:** deploy to staging, then prod. Wait 24h. Compare p50/p95/p99.
**Decide:** the top-1 hot phase is what PR 2 caches. If you guess
wrong, you write a cache that helps 5% of cost.

### PR 2 — Per-tile score cache

**Scope:**
- New file `apps/simulation/src/ai/ai-frontier-score-cache.ts` (≤300 lines).
  Map of `tileKey → { score, validAtOwnershipVersion, validAtEconEpoch }`.
- Hook into `frontier-command-planner.ts` scoring: lookup before
  computing; write back after.
- Invalidation: subscribe to ownership-change events from runtime
  (look at how `tileCollectionVersion` is bumped today — same trigger).
- Per-player cache, not global; ownership changes only affect one
  player's frontier scoring.

**Don't touch:** the scoring math itself. Same scores, just cached.

**Validation:** PR 1's metrics should show `analyze_per_candidate` drop
80%+ on warm ticks. `analyze_score_calc` may be unchanged (only the
lookup is cached). Cache hit-rate metric (`sim_ai_planner_cache_hits`,
`sim_ai_planner_cache_misses`) must be reported.

### PR 3 — Frontier heap

**Scope:**
- New file `apps/simulation/src/ai/ai-frontier-heap.ts` (≤300 lines).
  Per-player max-heap of `{ tileKey, score }`.
- Maintained incrementally by the cache invalidation hook from PR 2:
  when a tile's score changes, update its heap position.
- Planner reads `topN(playerId, k)` instead of iterating
  `frontierTileKeys`.

**Don't touch:** the spatial focus mechanism (`ai-spatial-focus.ts`).
It still rotates the front; the heap is the underlying index.

**Validation:** `planner_choose_frontier` p99 should drop below 5ms.
`planner_total` p99 below 15ms.

### PR 4 — Time budget safety net

**Scope:**
- 10ms hard timeout around `requestPlan` in ai-command-producer-worker.ts.
- On timeout: take the current heap's top result if available, else
  emit `noCommand` with reason `planner_budget_exceeded`.
- New metric: `sim_ai_planner_budget_exceeded_total`.

**Don't touch:** anything before this PR. This is purely additive
safety.

**Validation:** budget breach counter should be zero in steady state.
If it's not zero after PR 3, something earlier regressed.

## File-size discipline

`automation-command-planner.ts` is already 937 lines (over the 500 cap).
**Do not add to it.** All new logic lives in new files; only
import-site edits in the existing file.

## What NOT to do

- Do not change scoring math. Different scores = different AI = a
  different problem.
- Do not skip PR 1. Without measurements, PRs 2–4 are guesses.
- Do not combine PRs. Each is independently revertable.
- Do not raise the spatial-focus cap from 256. That's already tuned.
- Do not touch ai-planner-worker.ts message protocol unless PR 4
  strictly requires it.

## Validation across the whole sequence

Run after each merge:
```
pnpm --filter @border-empires/simulation test
pnpm --filter @border-empires/simulation typecheck
```

Then a 15-minute prod soak. Watch:
- `request_plan_round_trip` p99
- `sim_ai_planner_breaches` (count delta over 15 min)
- `sim_ai_planner_cache_hits` / `_misses` (after PR 2)
- `gateway_command_submit_latency_ms` p99 (should drop in lockstep)

## Tradeoff to surface in each PR body

- **Memory cost:** PR 2's cache is ~80 bytes × frontier tiles × players.
  At 256 × 5 = 1280 entries × 80B = 100KB. Negligible.
- **Correctness risk:** stale cache after an ownership change that
  doesn't bump `tileCollectionVersion`. Audit the runtime to confirm
  EVERY ownership mutation bumps the version. If not, fix that first.

## Self-review checklist (project rule)

- [ ] Measurement PR shipped and observed before optimization PRs.
- [ ] No edits to `automation-command-planner.ts` body (only imports).
- [ ] Scoring math byte-identical to pre-cache.
- [ ] Cache invalidation tested by unit test that mutates ownership.
- [ ] Each PR independently revertable.
