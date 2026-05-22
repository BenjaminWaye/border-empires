# LLM-Guided AI Training Pipeline

## Goal

Use an LLM as an offline strategy teacher for Border Empires, while keeping the live AI cheap, deterministic, and rule-exact.

The LLM should not choose live actions inside the simulation loop. It should instead:

- label planner states with strategic intent
- explain why a move is good or bad
- surface hidden gameplay motifs
- generate targets for smaller models or heuristic upgrades

The production AI should continue to run from deterministic planner code in:

- `apps/simulation/src/*`
- `packages/server/src/*`

## Existing repo hooks

The current repo already exposes the right raw material:

- planner-state transport:
  - `apps/simulation/src/planner-world-view.ts`
  - `apps/simulation/src/runtime.ts`
  - `apps/simulation/src/ai-planner-worker.ts`
- player-visible state snapshots:
  - `apps/simulation/src/player-snapshot.ts`
  - `apps/simulation/src/simulation-service.ts`
- parity and trace harnesses:
  - `scripts/rewrite-parity-record.mjs`
  - `docs/parity-traces/`
- legacy and rewrite world bootstrap:
  - `apps/simulation/src/legacy-snapshot-bootstrap.ts`
  - `apps/simulation/src/snapshot-store.ts`

That means the training pipeline should be built around exported planner records, not around screen scraping or a separate fake client.

The current worktree now includes a rewrite-side recorder:

- set `SIMULATION_AI_TRAINING_RECORD_PATH=/absolute/path/to/records.jsonl`
- run the simulation normally
- planner decisions will append compact JSONL records at that path

The recorder is wired in:

- `apps/simulation/src/ai-planner-worker.ts`
- `apps/simulation/src/ai-training-records.ts`
- `apps/simulation/src/ai-training-recorder.ts`

## Recommended architecture

### 1. Record training examples from real planner states

Create a JSONL corpus where each line is one decision point. The minimal record shape should be:

```json
{
  "recordId": "season20:tick184233:player-ai-7",
  "source": {
    "seasonId": "season-20ai",
    "tick": 184233,
    "playerId": "ai-7",
    "runtime": "rewrite-simulation"
  },
  "plannerState": {
    "player": {},
    "tiles": [],
    "docks": []
  },
  "candidates": {
    "settlement": [],
    "frontier": [],
    "build": []
  },
  "chosenAction": {
    "type": "EXPAND",
    "payload": {}
  },
  "outcome": {
    "resolved": true,
    "deltaTicks": 18,
    "territoryGain": 1,
    "settlementUnlocked": false
  }
}
```

The important principle is that the record should contain:

- the compact planner world view
- the candidates considered by the planner
- the action actually chosen
- a delayed outcome label when available

### 2. Label those examples with an LLM

Use the LLM to annotate each decision point with:

- phase: `opening`, `growth`, `pressure`, `defense`, `conversion`
- primary goal:
  - `expand_frontier`
  - `scout`
  - `scaffold_settlement`
  - `settle`
  - `grow_economy`
  - `fortify`
  - `pressure_enemy`
  - `clear_barbarians`
  - `recover`
- frontier class:
  - `economic`
  - `scaffold`
  - `scout`
  - `waste`
- move quality:
  - `strong`
  - `playable`
  - `dubious`
  - `blunder`
- hidden mechanics the move is exploiting
- tactical motifs
- a better move when the chosen move is weak

This is exactly what the new batch-builder script generates prompts for:

- `scripts/build-ai-labeling-batch.mjs`
- `pnpm ai:labeling:batch`
- `scripts/run-ai-labeling-local.mjs`
- `pnpm ai:labeling:local`
- `scripts/sample-ai-labeling-records.mjs`
- `pnpm ai:labeling:sample`
- `scripts/validate-ai-labels.mjs`
- `pnpm ai:labeling:qa`
- `scripts/build-ai-labeling-escalation-set.mjs`
- `pnpm ai:labeling:triage`

Input:

- `tmp/ai-training/records.jsonl`

Output:

- `tmp/ai-training/labeling-batch.jsonl`
- `tmp/ai-training/token-usage-report.json`

That output is intentionally shaped for OpenAI batch-style offline labeling. It can also be adapted for any other LLM provider.

Hosted batch generation fails closed by default. First run a dry-run estimate:

```bash
AI_LABELING_DRY_RUN=1 \
AI_LABELING_INPUT_USD_PER_MTOK=<current-input-price> \
AI_LABELING_OUTPUT_USD_PER_MTOK=<current-output-price> \
pnpm ai:labeling:batch
```

Then generate a bounded batch only after reviewing `tmp/ai-training/token-usage-report.json`:

```bash
AI_LABELING_MAX_RECORDS=100 \
AI_LABELING_MAX_OUTPUT_TOKENS=384 \
AI_LABELING_INPUT_USD_PER_MTOK=<current-input-price> \
AI_LABELING_OUTPUT_USD_PER_MTOK=<current-output-price> \
AI_LABELING_MAX_ESTIMATED_USD=5 \
pnpm ai:labeling:batch tmp/ai-training/records.escalate.jsonl
```

Use provider current per-million-token prices for the two pricing variables. The script intentionally does not keep baked-in prices because stale pricing is worse than no estimate. Other useful guards:

- `AI_LABELING_MAX_INPUT_TOKENS=N`
- `AI_LABELING_MAX_TOTAL_TOKENS=N`
- `AI_LABELING_TOKEN_REPORT_PATH=/absolute/path/report.json`
- `AI_LABELING_LABEL_CACHE_PATH=/absolute/path/labeled-records.jsonl`
- `AI_LABELING_DISABLE_CACHE=1`
- `AI_LABELING_PROMPT_CACHE_RETENTION=24h` for supported hosted models only

The batch prompt puts stable instructions first and compact per-record JSON last so hosted provider prefix caching can work. It also sets a stable prompt cache key and caps output tokens. Extended `24h` cache retention is opt-in because not every hosted model supports it.

Batch generation also checks the label cache before writing requests. By default it reads `tmp/ai-training/labeled-records.local.jsonl` and skips records whose exact `recordHash` is already labeled, so hosted escalation does not pay again for examples that a local teacher already covered.

Before labeling a large run, sample the corpus so repeated no-op states do not dominate token spend:

```bash
pnpm ai:labeling:sample
```

This reads `tmp/ai-training/records.jsonl` and writes:

- `tmp/ai-training/records.sampled.jsonl`
- `tmp/ai-training/sample-report.json`

Useful sampling caps:

- `AI_LABELING_SAMPLE_MAX_RECORDS=N`
- `AI_LABELING_SAMPLE_MAX_PER_ACTION=N`
- `AI_LABELING_SAMPLE_MAX_NOOP=N`
- `AI_LABELING_SAMPLE_MAX_PER_PLAYER=N`

For local teacher runs, the worktree now also supports:

```bash
AI_LABELING_PROVIDER=ollama \
AI_LABELING_MODEL=qwen2.5:7b-instruct \
pnpm ai:labeling:local
```

or an OpenAI-compatible local server such as `vllm`:

```bash
AI_LABELING_PROVIDER=vllm \
AI_LABELING_BASE_URL=http://127.0.0.1:8000/v1 \
AI_LABELING_MODEL=Qwen/Qwen2.5-7B-Instruct \
pnpm ai:labeling:local
```

This writes:

- `tmp/ai-training/labeled-records.local.jsonl`
- `tmp/ai-training/token-usage-report.local.json`

Useful knobs:

- `AI_LABELING_CONCURRENCY=1..N`
- `AI_LABELING_MAX_RECORDS=N`
- `AI_LABELING_MAX_OUTPUT_TOKENS=N`
- `AI_LABELING_LABEL_CACHE_PATH=/absolute/path/labeled-records.jsonl`
- `AI_LABELING_DISABLE_CACHE=1`
- `AI_LABELING_DRY_RUN=1`

For low-cost local labeling, start with `Qwen2.5-7B-Instruct` and a small `AI_LABELING_MAX_RECORDS` cap, then only escalate ambiguous or low-quality labels to a stronger model. Local labels include a `recordHash`, and reruns reuse matching cached labels from the output file by default. The hash covers the prompt version plus the compact teacher context, so changing the record payload or label prompt version forces a new label instead of reusing a stale one.

Before using labels for training or heuristic work, run the QA gate:

```bash
pnpm ai:labeling:qa
```

This reads:

- `tmp/ai-training/records.sampled.jsonl`
- `tmp/ai-training/labeled-records.local.jsonl`

and writes:

- `tmp/ai-training/labeled-records.accepted.jsonl`
- `tmp/ai-training/records.qa-escalate.jsonl`
- `tmp/ai-training/label-quality-report.json`

The QA gate validates the full label contract, rejects labels with invalid enum values or malformed `trainingTargets`, and escalates labels that look too thin or strategically suspicious. Set `AI_LABELING_QA_ACCEPT_QUALITY_WARNINGS=1` only when you want schema-valid but low-signal labels to pass through with `qualityWarnings` attached.

The worktree now includes an active-learning triage pass:

```bash
pnpm ai:labeling:triage
```

This reads:

- `tmp/ai-training/records.jsonl`
- `tmp/ai-training/labeled-records.local.jsonl`

and writes:

- `tmp/ai-training/records.escalate.jsonl`
- `tmp/ai-training/triage-report.jsonl`

The current escalation rules are heuristic rather than model-probability based. They escalate records when the cheap label suggests:

- `moveQuality` is `dubious` or `blunder`
- `betterAction` is non-null
- frontier classification looks like `waste`
- scouting labels conflict with the strategic targets
- hidden mechanics or tactical motifs are empty
- the explanation is too thin to trust

That gives you a practical low-cost loop:

1. sample repeated states with `pnpm ai:labeling:sample`
2. label the sampled corpus cheaply with `pnpm ai:labeling:local tmp/ai-training/records.sampled.jsonl`
3. validate label quality with `pnpm ai:labeling:qa`
4. send only `records.qa-escalate.jsonl` or `records.escalate.jsonl` to a stronger local or hosted teacher

### 3. Distill the labels into production-friendly targets

Do not try to deploy the raw LLM.

Instead, use the labeled corpus for one or more of these:

- heuristic upgrades
  - add new planner features
  - add new scoring terms
  - add new candidate filters
- imitation model
  - small policy model over planner features
- value model
  - estimate whether a state is setting up settlement, pressure, economy, or waste
- classifier heads
  - `frontierClass`
  - `shouldSettleSoon`
  - `shouldPressureEnemy`
  - `shouldPreferScoutShape`
  - `shouldBuildEconomy`

The live planner can then use those cheap outputs as scoring hints, not as the full decision-maker.

## Concrete phase plan

### Phase A: Corpus generation

Add a decision recorder around the current planner boundary.

Recommended insertion points:

- rewrite:
  - `apps/simulation/src/automation-command-planner.ts`
  - `apps/simulation/src/frontier-command-planner.ts`
  - `apps/simulation/src/ai-settlement-priority.ts`
- legacy:
  - `packages/server/src/server-ai-frontier-planning-runtime.ts`
  - `packages/server/src/server-ai-frontier-selection-runtime.ts`
  - `packages/server/src/server-ai-frontier-settlement.ts`
  - `packages/server/src/server-ai-frontier-scout.ts`

For each decision, record:

- compact player summary
- relevant tile slice
- candidate actions with raw scores
- chosen action
- final noop reason when no action is chosen

Do not record the whole world. Keep the corpus planner-local.

For the rewrite simulation path, the current record includes:

- compact player economy and tech state
- sampled owned/frontier/hot-frontier/strategic-frontier/build-candidate tile slices
- full tile counts for each slice so labels know when a sample was truncated
- dock-link metadata
- chosen action payload
- noop diagnostic and pending-settlement keys

That gives you a usable first-pass corpus without introducing whole-world snapshots.

The recorder samples tile slices before they reach the labeling prompt. Defaults:

- owned: 24
- frontier: 48
- hot frontier: 48
- strategic frontier: 48
- build candidates: 32

Useful recorder-side caps:

- `SIMULATION_AI_TRAINING_TILE_SAMPLE_LIMIT=N` applies one global cap to every tile slice.
- `SIMULATION_AI_TRAINING_OWNED_TILE_LIMIT=N`
- `SIMULATION_AI_TRAINING_FRONTIER_TILE_LIMIT=N`
- `SIMULATION_AI_TRAINING_HOT_FRONTIER_TILE_LIMIT=N`
- `SIMULATION_AI_TRAINING_STRATEGIC_FRONTIER_TILE_LIMIT=N`
- `SIMULATION_AI_TRAINING_BUILD_CANDIDATE_TILE_LIMIT=N`

Samples prioritize command origin/target tiles, pending-settlement tiles, towns, resources, docks/structures, then stable coordinate order. Keep these caps low for first-pass local labeling. Raise them only for escalation records where the missing context is visible in the token report or label quality.

### Phase B: Teacher labeling

Run:

```bash
AI_LABELING_DRY_RUN=1 \
AI_LABELING_INPUT_USD_PER_MTOK=<current-input-price> \
AI_LABELING_OUTPUT_USD_PER_MTOK=<current-output-price> \
pnpm ai:labeling:batch
```

after populating:

- `tmp/ai-training/records.jsonl`

Review:

- `tmp/ai-training/token-usage-report.json`

Prefer sampling, then local labeling, then triage, then hosted escalation:

```bash
pnpm ai:labeling:sample
AI_LABELING_MAX_RECORDS=500 pnpm ai:labeling:local tmp/ai-training/records.sampled.jsonl
pnpm ai:labeling:triage tmp/ai-training/records.sampled.jsonl
AI_LABELING_MAX_RECORDS=100 \
AI_LABELING_MAX_ESTIMATED_USD=5 \
AI_LABELING_INPUT_USD_PER_MTOK=<current-input-price> \
AI_LABELING_OUTPUT_USD_PER_MTOK=<current-output-price> \
pnpm ai:labeling:batch tmp/ai-training/records.escalate.jsonl
```

Both local and hosted scripts report `cachedRecords` and `uncachedRecords` in the token usage report. The estimated token and cost totals are for uncached work only. Set `AI_LABELING_DISABLE_CACHE=1` when intentionally regenerating labels.

Then send the produced:

- `tmp/ai-training/labeling-batch.jsonl`

to an offline LLM batch job.

Persist the returned labels as:

- `tmp/ai-training/labeled-records.jsonl`

Example local flow:

```bash
SIMULATION_AI_TRAINING_RECORD_PATH=tmp/ai-training/records.jsonl pnpm rewrite:restart:20ai
pnpm ai:labeling:batch
```

### Phase C: Feature distillation

From the labeled corpus, derive:

- strategic counters:
  - how often good moves are `economic`
  - how often good moves are `scaffold`
  - how often row-fill moves are labeled `waste`
- new planner features:
  - settlement distance-to-payoff
  - next-step strategic reach
  - town-support conversion potential
  - hostile-border tempo pressure
  - hidden dock-route leverage

Use those to update:

- `apps/simulation/src/frontier-command-planner.ts`
- `apps/simulation/src/ai-settlement-priority.ts`
- `packages/server/src/server-ai-frontier-*`

### Phase D: Small-model optional path

If heuristics stop scaling well, train a compact model on top of planner features:

- input:
  - player summary
  - top-k candidate features
  - local topology features
- outputs:
  - candidate ranking
  - move quality estimate
  - strategic class

Deploy only if it is:

- deterministic enough
- cheap enough for worker use
- robust under large-empires

## What the LLM should teach

The LLM is most useful for surfacing hidden or non-obvious structure:

- frontier as disposable pathing, not value by itself
- when a frontier move is really a settlement scaffold
- when island/dock reach beats compact border shape
- when exploration yield matters more than immediate tile quality
- when visible land shape implies hidden strategic payoff
- when economy should be delayed for one more reach step
- when a broad row-fill move is waste despite being locally legal

Those are the labels the current rule-based planner struggles to invent by itself.

## Guardrails

- Never put the LLM in the live simulation loop.
- Never let the LLM bypass legality or state-transition code.
- Never train on whole-world raw blobs if planner-local slices are enough.
- Keep the final runtime deterministic whenever possible.
- Treat the LLM as a teacher, critic, and labeler, not as the shipping brain.

## Suggested next implementation

1. Add a `training recorder` behind a flag at the planner boundary.
2. Emit `records.jsonl` from both rewrite and legacy AI paths.
3. Run `pnpm ai:labeling:batch`.
4. Inspect a few hundred labels manually.
5. Port the highest-signal labels into planner features and tests.

That gives the repo an immediate path from human/LLM strategic knowledge to production-safe AI behavior.
