# AI Rewrite Evaluation: Behavior Tree + Utility AI

## Purpose

This document scopes a full replacement of the current server AI with a behavior-tree executor backed by utility scoring. The replacement target is not "different AI"; it is a materially cheaper AI that can scale to `100` concurrent empires on a `1 GHz`, `512 MB` server without collapsing tick cadence.

## What the current AI must be able to do

Reading the existing implementation in `packages/server/src/main.ts`, `packages/server/src/ai/planner-shared.ts`, `packages/server/src/ai/goap.ts`, and `packages/server/src/sim/service.ts` shows that a competent AI player currently needs to:

- survive the opening by expanding and securing food
- choose and periodically re-evaluate a season victory path
- react to threat posture with `BREAK`, `CONTAIN`, or `TRUCE`
- claim neutral frontier tiles for economy, scouting, and scaffolding
- attack barbarians and pressure enemy borders
- settle owned frontier tiles, including town-support and island settlement cases
- build forts on exposed towns, docks, and chokepoints
- build economic structures on food, trade, and resource tiles
- opportunistically collect shards
- request or accept truces in low-value wars
- pick tech and domain choices
- respect execution constraints such as gold, stamina, pending settlements, pending captures, and simulation-queue backpressure

Those are the real parity requirements. Any rewrite that only handles border expansion and combat will look functional in isolation and still produce weak empire play.

## Why replace the current model

The current AI already contains useful guardrails:

- lightweight planning snapshots
- cached territory summaries and selector indexes
- scheduler backpressure against worker and simulation queues
- selector-level scan budgets

The remaining problem is structural:

- tactical choice lives in a very large `main.ts`
- heavy selectors are still required at execution time
- the planner and executor are coupled to specific scoring branches
- adding new tactics increases both branch count and selector cost

GOAP is serviceable for narrow tactical plans, but it is the wrong center of gravity for the next scaling target. For `100` concurrent AIs, the cheap operation must be "rank intents from cached signals", and expensive target selection must happen only for the one intent that wins.

## Target architecture

### 1. Four-layer decision pipeline

- `Perception`: build a compact snapshot from cached territory, economy, diplomacy, and victory-pressure signals
- `Doctrine`: choose a medium-horizon strategic posture that persists across several tactical turns
- `Utility`: score a small set of intents from that snapshot and current doctrine
- `Behavior tree`: execute the winning intent through guarded steps and fallbacks

The doctrine layer is now the first concrete step of the hierarchy in code. It does not replace utility scoring; it biases it. The intent is to stop every turn from being decided as a fresh local heuristic race and instead preserve a low-cost strategic commitment such as:

- crisis stabilization
- economic scaling
- island expansion
- town assault
- border pressure
- diplomatic reset
- consolidate

Doctrine selection is now designed to be persistent. It should only be reevaluated when the AI's coarse strategic signature changes or when a periodic refresh window expires. This is the first event-driven invalidation seam in the rewrite and is intended to prevent strategic thrash under high AI counts.

### 2. Replace plan search with intent ranking

The new "brain" should rank a fixed set of intents:

- `SURVIVE`
- `RECOVER_ECONOMY`
- `EXPAND_FRONTIER`
- `SETTLE_FRONTIER`
- `FORTIFY_CHOKEPOINT`
- `PRESSURE_ENEMY`
- `CLEAR_BARBARIANS`
- `COLLECT_SHARD`
- `MANAGE_TRUCE`
- `WAIT`

Utility should operate only on cached booleans, counts, ratios, and coarse scores. It should not scan candidate tiles.

### 3. Keep heavy scans out of planning

The only code allowed to call expensive selectors should be the action-specific behavior-tree leaf that is about to execute:

- `bestAiEnemyPressureAttack`
- `bestAiSettlementTile`
- `bestAiTownSupportSettlementTile`
- `bestAiIslandSettlementTile`
- `bestAiFortTile`
- `bestAiEconomicStructure`
- `bestAiFrontierAction`

This matches the existing guardrails and should become stricter, not looser.

## Performance target

The current defaults are:

- `AI_TICK_MS = 3000`
- `AI_TICK_BUDGET_MS = 1000`

Those defaults are too expensive for the target hardware if many AIs are active together.

The rewrite should instead assume:

- a cheap policy evaluation pass for all active AIs every scheduler cycle
- one heavy selector call at most for the chosen intent
- strict shedding when worker or simulation queues are backpressured

Initial planning budget for evaluation:

- `<= 0.25 ms` average for pure policy evaluation per AI
- `<= 25 ms` total pure policy time for `100` AIs
- `<= 2.5 MB` transient allocation growth during a `100` AI planning batch

These are not final production thresholds. They are the first proxy budget that should keep us far away from multi-second stalls on low-end hardware.

## Migration plan

### Phase 0: Evaluation and shadow brain

- codify current AI competencies
- implement pure utility scoring and behavior-tree traversal
- benchmark `100` synthetic AI contexts in test
- keep current AI as the live executor

### Phase 1: Adapter layer

- map existing planning snapshot data into the new compact context
- map existing simulation commands into behavior-tree leaf actions
- run the new brain in shadow mode and log divergence from the live AI

### Phase 2: Live cutover

- switch live intent choice to the new utility+tree brain
- leave existing heavy selectors behind stable action leaf interfaces
- delete GOAP worker usage once parity and performance hold

### Phase 3: Selector replacement

- replace expensive selector internals incrementally with cheaper indexed queries
- keep parity tests for settlement, pressure attack, fort, and economy actions

## Non-goals for the first slice

- deleting current AI execution in this branch
- hand-porting every selector immediately
- changing combat or economy rules
- pretending the websocket load simulator measures server-side AI cost

## Immediate deliverables in this branch

- a capability model for the replacement AI
- a pure behavior-tree + utility core
- regression tests for competence-oriented intent choice
- a perf smoke benchmark for `100` concurrent AI evaluations

## Runtime verification notes

- The server now supports `AI_BRAIN_MODE=behavior_tree_utility` for live decision selection.
- The benchmark harness at `scripts/benchmark-ai-runtime.mjs` boots the built server, forces `AI_PLAYERS=100`, and checks runtime metrics through `/admin/runtime/debug`.
- For the `512 MB` target, the server runtime needs an explicit Node heap cap. This branch sets `NODE_OPTIONS=--max-old-space-size=256` in `Dockerfile.server`, and the benchmark harness uses the same default unless overridden.
- A verified fresh-world benchmark on this branch completed with:
  - `100` AI players observed and scheduled
  - `0` AI budget breaches
  - `14 ms` AI tick p95
  - `439.2 MB` max RSS
  - `0` AI simulation queue depth peak
