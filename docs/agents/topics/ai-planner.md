# AI Planner

## Scope

How the AI decision pipeline is structured, how to profile its per-plan CPU
cost, what it actually emits vs. computes, and how to find dead/wasteful work in
it. The planner's steady-state CPU is the AI's baseline load on the single
shared vCPU — it's a direct contributor to login starvation, so keep it lean.
See `staging-login-cpu-contention.md` for the login-vs-CPU story.

## Architecture

- **`ai-planner-worker.ts`** runs in a `worker_threads` Worker (spawned by the
  bridge). Actual planning (`planAutomationCommand`) happens here, off the main
  sim thread. State is kept in-memory and updated via `sync_players` / `tile_deltas`.
- **`ai-command-producer-worker.ts`** is the *bridge* on the main sim thread:
  it owns the tick loop, posts `plan` requests to the worker, and submits the
  returned command. `request_plan_round_trip` (main-thread wrapper) ≈
  `planner_total` (worker-side) — the postMessage transport is cheap.
- **One worker serves all AI players.** The tick loop processes **one player
  per tick**, round-robin with a starvation guard (`ai-tick-fairness.ts`,
  `buildAiTickIterationOrder`). So AI is already staggered — do not "spread the
  AIs out" further; that's done.
- The decision itself is a small utility policy (`ai/utility/decisions.ts`):
  classes are **EXPAND, ATTACK, MUSTER, BUILD_DEFENSE, BUILD_ECONOMY,
  CHOOSE_TECH, WAIT**. There is **no SETTLE class** (see below).

## Profiling per-plan cost

`sim_ai_planner_phase_ms{phase=...}` (p50/p95/p99) breaks a plan into phases.
Scrape it from inside the container:

```bash
flyctl ssh console -a border-empires-combined-staging -C "node -e \"fetch('http://127.0.0.1:50052/metrics').then(r=>r.text()).then(t=>require('fs').writeFileSync('/tmp/m.txt',t))\""
flyctl ssh console -a border-empires-combined-staging -C "sh -c 'grep sim_ai_planner_phase_ms /tmp/m.txt'"
```

Load-bearing phases (do NOT cut — each produces real commands):
- `planner_choose_frontier` + `analyze_iter_total` / `analyze_per_candidate` —
  the EXPAND/ATTACK target scan in `frontier-command-planner.ts`. This is the
  AI's primary action selection. Already bounded (`NARROW_ANALYZE_MAX_CANDIDATES`,
  spatial-focus restriction).
- `planner_total` = sum of the worker-side phases.

Note: `sim_tick_duration_ms{source=ai}` p99 can be much larger than
`request_plan_round_trip` p99 under load — the gap is **CPU-starvation
wall-clock inflation** on the oversubscribed vCPU, not planner code cost.

## What the AI actually emits (grep this to spot dead work)

Emitters: `EXPAND`, `ATTACK`, `SET_MUSTER`/`ADVANCE`, `CHOOSE_TECH`,
`CHOOSE_DOMAIN`, `BUILD_FORT`, `BUILD_ECONOMIC_STRUCTURE`,
`BUILD_SIEGE_OUTPOST`, `COLLECT_VISIBLE`; barbarian planner: `EXPAND`,
`ATTACK`, `UNCAPTURE_TILE`.

The AI does **NOT** emit `SETTLE` (human-client only — `client-queue-logic.ts`)
or `BUILD_OBSERVATORY`. Any AI code computing candidates/branches for those is
dead. `evaluateSettlementCandidate` is still used for frontier *classification*
(planner-candidate-index, frontier-command-planner) — that one is NOT dead.

## Already-removed dead work (don't re-flag)

- **Settlement-candidate selection** (#953): `choose_settlement` scanned ~1,500
  frontier tiles twice (~453ms p99) purely to feed scoring nudges for a SETTLE
  command the AI never emits. Removed.
- **Discarded training records** (#956): `buildAiTrainingRecord` (sorts full
  owned/frontier arrays) ran every plan even when
  `SIMULATION_AI_TRAINING_RECORD_PATH` is unset (staging/prod). Now gated on
  `aiTrainingRecorder.enabled`.
- **Town-support scans** (#950): the 3×-redundant neighbor scans in
  `chooseBestEconomicBuild` were already optimized into `town-support-lookup.ts`.
  The `townSupportOrigins` filter reads stored `supportMax`/`supportCurrent` and
  is a cheap bounded filter over `buildCandidateTiles` — **not** a removal
  candidate. (Earlier audits wrongly flagged it; verify before re-flagging.)

## How to find dead / wasteful AI code

The one habit: **for every non-trivial computation, name the command it
changes. If you can't, it's a suspect.** Concretely:

1. **Trace outputs to a command.** Follow a computed value forward. If it only
   feeds diagnostics/metrics/scoring-nudges and never flips the chosen command,
   it's dead weight (this is exactly how `choose_settlement` was caught).
2. **Grep command emitters vs. types.** `grep -rn 'type: "X"'` per command type;
   if a type is only constructed by the client (or not at all on the AI path),
   AI code computing for it is dead (caught SETTLE, BUILD_OBSERVATORY).
3. **Compute-then-discard when a flag is off.** Check that a feature flag gates
   the *compute*, not just the output. `buildAiTrainingRecord` was passed as the
   argument to a no-op recorder — the build ran regardless (caught #956).
4. **Unused exports.** From `apps/simulation/src/ai/`, list `^export` names and
   grep each repo-wide (`grep -rlw`, include tests); zero external hits +
   `internal-uses=0` = genuinely dead. Beware: "used only in tests" or "used
   internally" is over-exported, not dead — verify before deleting.
5. **Rank `sim_ai_planner_phase_ms` and interrogate the top phases.** Any
   expensive phase you can't tie to a gameplay output is a suspect.

As of 2026-07-16 the recurring-CPU dead code is spent — remaining finds are cold
(unused types/helpers). Further real gains need structural levers (worker-thread
consolidation, planning cadence), not deletion.

## Known pitfalls

- The AI decision-diagnostics buffer (`recordAiDecisionDiagnosticFromPlanner`)
  looks like write-only "record-then-never-read" — but it **is** read via the
  `GetAiDecisionDiagnostics` RPC (`/admin/debug/ai/decisions`). Not dead.
- `frontPosture`/attack-gating thresholds live in
  `automation-strategic-snapshot.ts` and have several branches — read the
  function, don't trust a single restated threshold.
- **Waste-inclusive aggregate counts silently gate unrelated decision classes**
  (staging incident, ai-4/ai-1 permanently on WAIT with gold above cap and a
  ready `economicBuildCandidate`): `expansionOpportunityCount` in
  `utility-dispatch.ts` includes waste-classified plain neutrals (tiles
  `EXPAND` itself refuses via `hasActionableNonWasteExpand`). Any *other*
  decision class that uses it as an "expansion is available, defer to it"
  suppression term (e.g. `scoreBuildEconomy`) gets suppressed by tiles that
  were never actually available. Fixed by adding
  `nonWasteExpansionOpportunityCount` (waste excluded) for BUILD_ECONOMY's
  suppression term specifically — `expansionOpportunityCount` is still correct
  for EXPAND's own linear-signal term, since EXPAND's veto already gates the
  waste-only case first. When wiring a new consideration off an existing
  aggregate field, check whether that field's *inclusions* still match the
  new consumer's definition of "available."
- **`restrictToFocus`'s unfiltered-fallback silently defeats
  `ai-spatial-focus.ts`'s rotation** (same staging incident): `restrictToFocus`
  (in `automation-command-planner.ts`) widens to the full unfiltered candidate
  list whenever the current focus front has zero overlap with the candidate
  set — by design, so a bad focus never starves the AI entirely. But feeding a
  result found *only* via that widening into `scanFoundActionableCandidate`
  (which drives `ai-spatial-focus.ts`'s unproductive-streak rotation) makes
  every front look "productive" forever, since the widened scan effectively
  re-scans the whole empire regardless of which front is nominally active.
  For a large empire this pins the focus origin on the same dead 256-tile
  window for 10+ minutes (confirmed live: identical `neighborCandidateTotal`
  and `economicBuildCandidate` across 5.5 minutes of polling, well past the
  60-75s soft-expiry). Fixed by tracking whether each `restrictToFocus` call
  relevant to the productivity signal actually had to widen
  (`frontierScanUsedFocusFallback` / `buildScanUsedFocusFallback`) and
  excluding fallback-sourced results from `scanFoundActionableCandidate` —
  command *execution* still uses the widened candidate regardless (finding a
  real, distant candidate and building it is correct), only the "is *this*
  front worth staying on" signal changes.
- **`spatialFocusFront` is never wired into the worker-based AI planning
  path** (`ai-planner-worker.ts` / `PlannerPlayerView`) — it's only computed
  and passed in `runtime.ts`'s direct/non-worker `planAutomationCommand`
  call. Staging runs with `SIMULATION_AI_WORKER=1`, so on staging
  `focusFront` is *always* `undefined` and `restrictToFocus` never actually
  restricts anything — the real EXPAND-stall driver there was origin
  *selection* (see next entry), not focus-front scoping. Check which path is
  active (`SIMULATION_AI_WORKER` env var) before assuming spatial-focus code
  is in effect.
- **`baseFrontierOrigins` is winner-take-all across categories, not a union**
  (`hotFrontierTiles ?? strategicFrontierTiles ?? frontierTiles ?? ownedTiles`,
  `automation-command-planner.ts`): if `hotFrontierTiles` is non-empty
  *anywhere* in the empire (one hostile/strategic-neutral neighbor is
  enough), the narrow scan origin set becomes *only* that hot tile's
  neighbors — every calm/scoutable segment of the frontier is invisible that
  tick, regardless of empire size. Confirmed live: ai-1's narrow scan
  (`neighborCandidateTotal: 8`) evaluated exactly one origin's 8-neighbor
  set, nowhere near a real GEMS resource sitting 4 tiles from its actual
  frontier. The broad-fallback fix (previous entry, this file) recovers this
  *only* when the narrow scan is also unactionable — if the hot origin finds
  *anything* (even a low-value target), the broad fallback's
  `!frontierAnalysisActionable` gate never fires and the rest of the empire
  stays permanently unscanned. Not yet fixed — flagged for follow-up; any
  fix needs CPU-impact analysis per `docs/agents/ai-guardrails.md` before
  broadening how often/far the broad fallback runs.
- **`chooseBestFortBuild`/`chooseBestSiegeOutpostBuild` affordability
  prechecks were tier-unaware** (`structure-command-planner.ts`): they
  hardcoded the base-tier IRON/SUPPLY/gold cost (e.g. 45 iron for FORT)
  regardless of tech, but `runtime-structure-command-handlers.ts` always
  builds the player's *best available* tier via `bestFortTierForTech`/
  `bestSiegeTierForTech` (IRON_BASTION/THUNDER_BASTION, SIEGE_TOWER/
  DREAD_TOWER — up to 4x the base cost). A player with the relevant tech and
  partial resources passed the AI's stale check but was rejected by the
  runtime every time. Confirmed live: ai-5 had 74/74 `BUILD_FORT` commands
  rejected with "insufficient IRON for fort," forever. Fixed by resolving
  the actual tier via the same `bestFortTierForTech`/`bestSiegeTierForTech`
  helpers the runtime uses, before checking affordability. Also: neither
  structure's gold cost actually scales with existing owned count at
  runtime (unlike economic structures) — `ownedStructureCounts`-based gold
  scaling in the AI's old precheck was dead/incorrect for these two types.
