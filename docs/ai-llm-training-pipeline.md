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

Input:

- `tmp/ai-training/records.jsonl`

Output:

- `tmp/ai-training/labeling-batch.jsonl`

That output is intentionally shaped for OpenAI batch-style offline labeling. It can also be adapted for any other LLM provider.

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
- owned/frontier/hot-frontier/strategic-frontier/build-candidate tile slices
- dock-link metadata
- chosen action payload
- noop diagnostic and pending-settlement keys

That gives you a usable first-pass corpus without introducing whole-world snapshots.

### Phase B: Teacher labeling

Run:

```bash
pnpm ai:labeling:batch
```

after populating:

- `tmp/ai-training/records.jsonl`

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
