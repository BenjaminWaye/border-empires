# AI broad-fallback skip at large empire size — 2026-05-30

> Agent hand-off. Self-contained. Read all of it. Single PR.

## Why

PR 434 (measurement) revealed the AI cost picture is much better than
my earlier hypothesis: at current prod scale, `planner_total` p99 is
54ms — fine. But the bottom 1% tail (`analyze_iter_total` p99 = 587ms)
still blocks the sim worker long enough that
`gateway_command_submit_latency_ms` p99 = 2954ms — players still
occasionally see SIMULATION_UNAVAILABLE.

The cause is the **broad-fallback path** in
`apps/simulation/src/ai/automation-command-planner.ts` (~line 520-545):

```ts
if ((canAttack || canExpand) && !hasActionableFrontierAnalysis(frontierAnalysis) && input.frontierTiles.length > 0) {
  const broadFrontierOriginsAll = dedupeTiles([
    ...narrowFrontierOrigins,
    ...input.frontierTiles,
    ...ownedFrontierTiles
  ]);
  const broadFrontierOrigins = restrictToFocus(broadFrontierOriginsAll);
  if (broadFrontierOrigins.length > frontierOrigins.length) {
    const broadFrontierAnalysis = analyzeOwnedFrontierTargetsFromLookup(...);
    ...
  }
}
```

When the narrow frontier returns nothing actionable, this runs a SECOND
`analyzeOwnedFrontierTargetsFromLookup` on a bigger origin set. At
large empire sizes that second pass is the source of the 587ms tail.

## Goal

Skip the broad fallback when the empire is large enough that the cost
is no longer worth a marginal action gain. Players will not notice — at
that size, an AI that "does nothing this tick" is indistinguishable
from one that "tries hard, finds nothing, falls back, finds maybe one
thing."

## Scope (single PR)

**Change one file:**
`apps/simulation/src/ai/automation-command-planner.ts`

Add an early-return at the top of the fallback branch:

```ts
const SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD = 500;
if (input.ownedTiles.length > SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD) {
  // Broad fallback's second analyzeOwnedFrontierTargetsFromLookup
  // dominates the 587ms tail at this scale. The narrow result stands.
  // ... (skip the broad branch entirely)
}
```

Place the threshold as a top-level `const` near the other constants
in the file. Don't inline.

Add a metric: `sim_ai_broad_fallback_skipped_total{playerId}` — track
how often the skip fires so we know if the threshold is well-tuned.
Register in `apps/simulation/src/metrics/metrics.ts` (look for
`incrementSimAiPlannerBreaches` as the existing pattern).

## What NOT to do

- Don't touch the narrow-frontier path. It's the 99% case.
- Don't change the threshold by feel — 500 owned tiles is the rough
  prod-empire size where this fires. If telemetry shows the skip rarely
  fires OR fires too often, tune in a follow-up PR.
- Don't extract the broad-fallback into a helper. Just guard it.

## Validation

1. `pnpm --filter @border-empires/simulation typecheck`
2. `pnpm --filter @border-empires/simulation test`
3. Deploy to staging. Confirm `sim_ai_broad_fallback_skipped_total`
   increments at the right rate (every few minutes per AI at staging's
   smaller empire size — should be zero or rare since staging empires
   are smaller).
4. Deploy to prod. Watch:
   - `analyze_iter_total` p99 — should drop substantially
   - `gateway_command_submit_latency_ms` p99 — should drop below 2500ms
   - `sim_ai_broad_fallback_skipped_total` — should fire several times
     per minute per AI in prod

## Tradeoff (surface in PR body)

- **Upside:** removes the 587ms tail; eliminates the
  SIMULATION_UNAVAILABLE flap for players.
- **Downside:** AI at large empire size will more often emit no command
  on a tick when the narrow path produces nothing. Behavioral effect:
  AI may be slightly slower to react when its main front is quiet.
  Acceptable because at 500+ owned tiles the AI has plenty to do
  elsewhere.

## Self-review checklist

- [ ] Single function modified.
- [ ] Threshold defined as a named const, not a magic number.
- [ ] Metric added and registered.
- [ ] No edits to `frontier-command-planner.ts`.
- [ ] PR body surfaces the behavioral tradeoff.
