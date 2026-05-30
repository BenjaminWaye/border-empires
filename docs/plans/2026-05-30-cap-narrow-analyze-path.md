# Cap the narrow analyze path — 2026-05-30

> Agent hand-off. Self-contained. Single PR. Read all of it.

## Why

PR #439 (`SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD = 500`) shipped to
prod tonight but **never fires**. Confirmed via prometheus:
```
sim_ai_broad_fallback_skipped_total  (zero labeled lines, counter = 0)
```

The broad fallback only runs when the narrow path returns no actionable
frontier. At prod's empire size, the narrow path **always** finds
something actionable, so the broad branch is never entered, so the
threshold check is never reached.

**The actual hot path is the narrow `analyzeOwnedFrontierTargetsFromLookup`
call**, not the fallback. Current prod measurements:

| Metric | Staging (2554 tiles) | Prod (8024 tiles) |
|---|---|---|
| `analyze_iter_total` p99 | 130ms | **1844ms** |
| `gateway_command_submit_latency_ms` p99 | fine | **3120ms** (> 2.5s timeout) |
| `gateway_sim_rpc_latency_ms` p99 | fine | **3043ms** |

3× more tiles → 14× planner cost. Super-linear, not linear.

## Goal

`analyze_iter_total` p99 < 100ms at any empire size, **including the
narrow path**.

## Strategy — cap candidates, not origins

`analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey,
frontierOrigins, playerId, opts)` currently iterates every origin and
scores all neighbors. `ai-spatial-focus.ts` caps origins at 256, but
each origin expands to ~5–8 neighbor candidates, so the scored candidate
count is ~1500–2000 per call.

We need a **candidate-count cap** inside the analyzer, not just an
origin cap.

## What to change

Single file: `apps/simulation/src/frontier-command-planner.ts`

Look for the inner loop in `analyzeOwnedFrontierTargetsFromLookup` (the
one PR #434 instrumented with `analyze_per_candidate`). Add:

```ts
const NARROW_ANALYZE_MAX_CANDIDATES = 512;
```

(top-level const near other constants in the file)

Track candidate count in the loop. When it exceeds the cap, break out:

```ts
let candidatesEvaluated = 0;
for (const origin of frontierOrigins) {
  // existing neighbor enumeration
  for (const neighbor of neighbors) {
    if (candidatesEvaluated >= NARROW_ANALYZE_MAX_CANDIDATES) break;
    // existing scoring work
    candidatesEvaluated += 1;
  }
  if (candidatesEvaluated >= NARROW_ANALYZE_MAX_CANDIDATES) break;
}
```

**Important:** the loop should still pick the BEST candidates seen so
far when it exits early — current code tracks "best attack target"
and "best expand target" as running max during iteration, so the cap
just means we explore a subset. The AI still picks a good move; it
just doesn't exhaustively prove it's the best of 2000.

## Track the cap

Add a metric `sim_ai_narrow_analyze_capped_total{playerId="..."}`
incremented when the cap fires. Pattern: copy
`sim_ai_broad_fallback_skipped_total` from PR #439 — same plumbing
through `onAnalyzeTiming` or a new callback.

This lets you see how often the cap actually fires in prod and tune
the threshold.

## What NOT to do

- Do NOT touch `ai-spatial-focus.ts` (the origin cap is already
  correct; we're adding a layer beneath it).
- Do NOT change the scoring math.
- Do NOT raise the cap above 512 without measuring first — 512
  candidates × ~0.1ms per = ~50ms hard ceiling per analyze, well
  under the 100ms target.
- Do NOT skip writing the cap-fired counter — without it we won't
  know if 512 is right.

## Validation

Build, test, deploy to staging. Staging's `analyze_iter_total`
shouldn't change much (already <130ms) — the cap rarely fires
because staging empires are smaller. Then deploy to prod and watch:

- `analyze_iter_total` p99 should drop from 1844ms to <100ms
- `sim_ai_narrow_analyze_capped_total` should fire several times per
  minute per AI in prod (proves the cap is doing work)
- `gateway_command_submit_latency_ms` p99 should drop below 2500ms
- `simulation_ping_timed_out` log line should stop appearing

## Tradeoff to surface

- AI evaluates a subset of candidates. Behavioral effect: AI may pick
  a slightly worse expansion target when frontier has many good
  options. In practice, with 500+ frontier candidates the top-K by
  cheap heuristic is almost always near-optimal — humans wouldn't
  notice.
- Memory cost: zero (it's just a counter and a break).

## Self-review checklist

- [ ] Single file changed (`frontier-command-planner.ts`).
- [ ] Cap is a named top-level const, not inline.
- [ ] Counter metric registered AND emitted in prometheus output.
- [ ] Both inner and outer loop break when cap hit.
- [ ] Best-so-far is preserved on early exit.
- [ ] PR body surfaces the behavioral tradeoff.
