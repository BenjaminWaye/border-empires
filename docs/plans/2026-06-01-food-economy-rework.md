# Food Economy Rework — Implementation Handoff

You are implementing a food economy rework for Border Empires (a territory-control game). This document is self-contained: every change below has a concrete file path and anchor line number. Read the referenced code before editing — line numbers may have drifted slightly; match on the quoted code, not the number.

## Critical project rules (do not violate)

- **Work in a git worktree, never the primary checkout.** The primary checkout at `/Users/benjaminwaye/Sites/border-empires-container/border-empires` must stay on `main`. Create a worktree + feature branch off `main` for all edits.
- **Only touch the rewrite stack:** `apps/simulation`, `packages/game-domain`, `packages/client`, `packages/shared`, `packages/sim-protocol`, `packages/client-protocol`. NEVER edit `packages/server` (dead legacy).
- **500-line file maximum.** If a file would cross 500 lines, split by semantic family first.
- **Client changelog pre-push hook:** ANY change under `packages/client/src/` is blocked on push unless you bump `packages/client/src/client-changelog.ts` (version + a new entry). Phase 3 touches the client, so this applies.
- **Self-review after writing code:** re-read your own diff before declaring done.
- **Docker tsc is stricter than local** (`noUncheckedIndexedAccess` etc.) — verify types in a clean build.
- **Ask the human before each merge and before each deploy** — one approval covers one cycle only.
- One PR at the end, after self-review. Do NOT merge or deploy without explicit approval.

## Background (why)

Food is a near-dead currency: it covers a small per-minute town/structure upkeep (gating a binary `isFed` flag) and otherwise accumulates in a stockpile that is never spent. Once every town is fed, all surplus is silently discarded. There is no food cost to grow, upgrade, settle, or build. This rework gives food **real continuous demand** and makes FARM and FISH mechanically distinct:

- **FISH = perishable** — fish food can't accumulate (zero tile yield cap). Use-it-now flow. Unimprovable.
- **FARM = bankable + improvable** — farm food accumulates; Farmstead/Waterworks boost it.
- **Growth costs food** — a growing town consumes extra food each tick on top of upkeep; if it can't afford it, that town simply doesn't grow this tick (binary, no partial growth). It stays fed and keeps earning gold.
- **Tier upgrades are an explicit, food-paid player command** — replacing today's silent auto-promotion. This is the lump sink that gives the farm bank a purpose.

Strategic identity: inland farm empires bank + improve food and go tall; coastal fish empires get raw flow they must spend immediately and stay wide/shallow unless they trade for farm food.

## Status of prerequisites (already done — do not redo)

- **PR #457 is CLOSED** (the worldgen food-cluster approach, superseded by this rework). No action needed.
- **The `tickPopulationGrowth` dependency is already on `main`** (merged via #428). It lives in `apps/simulation/src/runtime.ts` at the method `tickPopulationGrowth(nowMs)` (around line 928–1087), already including nearby-war pause, long-peace bonus, delta broadcast, and stale-pause clearing. You do NOT need to wait for or merge any other branch. All Phase 2/3 hooks below reference this on-main method directly. (The old `agent/population-growth-tick` branch is superseded by #428's squash — ignore it.)

---

## Phase 1 — Fish is perishable (zero yield cap)

**Goal:** fish food can't be banked.

**File:** `apps/simulation/src/tile-yield-view.ts`

1. The yield cap is computed around line 126–134:
   ```ts
   const yieldCap = {
     gold: …,
     strategicEach: maxDaily > 0 ? maxDaily / 3 : TILE_YIELD_CAP_RESOURCE
   };
   ```
   Make `strategicEach` resource-aware so that a FISH tile gets `0`. The simplest correct form: if `tile.resource === "FISH"`, set `strategicEach: 0`; otherwise keep `maxDaily > 0 ? maxDaily / 3 : TILE_YIELD_CAP_RESOURCE`. A zero per-tile buffer means uncollected fish yield never accumulates between collections — it must be used as produced or it is lost. Leave the `goldPerMinute`/strategicPerDay rate emission untouched (the rate view still shows fish *produces* food; only the bankable buffer cap goes to zero).

2. **Verify the downstream pool behavior** (do not skip): read `apps/simulation/src/player-update-economy.ts` `buildFedTownKeys` (around lines 274–301). Confirm that fish food still contributes to the current-tick feeding/growth via `strategicProductionPerMinute.FOOD` (the per-minute production rate), but that the zero tile buffer means fish never builds a lasting stockpile in `player.strategicResources.FOOD`, while FARM (cap unchanged) still banks. If the pool unexpectedly banks fish, investigate where the tile buffer flows into the player pool and fix there — but expect the cap change alone to be sufficient.

3. **UI label:** in the yield/economy views (`apps/simulation/src/live-snapshot-view.ts` and any tile-detail yield rendering), label fish-sourced food as **perishable** so players understand why it doesn't accumulate. Find where strategic yield is surfaced for tiles and add a `perishable: true` flag (or equivalent label) for FISH-resource tiles. Keep it minimal — a flag the client can render, not a redesign.

**Tests:** in the tile-yield test file (search `tile-yield` under `apps/simulation`), assert FISH `yieldCap.strategicEach === 0` and FARM `strategicEach` unchanged (`72/3 = 24`).

---

## Phase 2 — Growth costs food (continuous sink, binary per-town)

**Goal:** growing population consumes food on top of upkeep; an unaffordable town skips growth this tick (stays fed, gold unaffected). No partial growth.

**File:** `packages/game-domain/src/server-game-constants.ts`
- Add `export const GROWTH_FOOD_COST_PER_POP = <value>;` near the other population/food constants (`POPULATION_GROWTH_BASE_RATE = 0.00032` is in this file — put it adjacent). Pick a small value so early towns grow freely but large cities create meaningful drain; start with a conservative number and tune in end-to-end testing. Document the unit in a one-line comment (food per unit of population added).

**File:** `apps/simulation/src/runtime.ts`, inside `tickPopulationGrowth` (the per-town loop, after `growth` is computed around line 1040–1043, BEFORE the population/tier write that follows):
- The relevant existing code:
  ```ts
  const growth = growthPerMinute * elapsedMinutes;
  if (growth <= 0) continue;
  const newPopulation = Math.min(town.maxPopulation, town.population + growth);
  ```
- Insert a food-affordability gate between `const growth = …` (after the `<= 0` guard) and `const newPopulation = …`:
  - Compute `growthFoodCost = growth * GROWTH_FOOD_COST_PER_POP`.
  - Attempt to spend it from the player's food pool. Use the existing `this.spendStrategicResource(player, "FOOD", growthFoodCost)` helper (same one used for CRYSTAL throughout — e.g. runtime.ts:5730). It returns `false` if the player can't afford it.
  - If `spendStrategicResource` returns `false`: **skip growth for this town this tick.** Do `this.townLastGrowthTickAtByKey.set(tileKey, nowMs); continue;` so the clock advances (no retroactive catch-up) and the town simply doesn't grow. Do NOT touch gold or fed state.
  - If it returns `true`: proceed with the existing `newPopulation` write as today.
  - **Important:** `buildFedTownKeys` (called at line 953) already deducted upkeep before this loop runs, so the food pool you're spending from is post-upkeep. Confirm this ordering when implementing.
- **Emit a counter** for the stall path (project rule: every guard/skip/cap gets a counter). Find the existing metric/counter pattern in runtime.ts and increment something like `growthStalledNoFood` when a town skips growth for lack of food, so we can detect whether the gate ever fires in prod.

**Snapshot surface:** add a per-town "growth food cost / min" figure so players can plan. In `live-snapshot-view.ts` where town growth info is built (the growth computation around lines 743–751), compute and emit `growthFoodCostPerMinute = growthPerMinute * GROWTH_FOOD_COST_PER_POP` (mirror the exact `growthPerMinute` formula used there — population × base rate × tier/granary/firstThree/logistic mults). This is display-only; keep it consistent with the authoritative tick formula in runtime.ts.

**Note on the logistic ceiling:** growth is already capped by `logisticFactor = 1 - population/maxPopulation` (runtime.ts:1012). A town at its `maxPopulation` has `growth = 0`, so it consumes no growth-food — that is *why* maxed farm towns bank surplus for tier upgrades. Don't add any separate ceiling.

**Tests:** extend `apps/simulation/src/runtime.population-growth.test.ts`:
- Growing town with enough food: population increases AND food pool decreases by `growth * GROWTH_FOOD_COST_PER_POP`.
- Growing town with insufficient food: population unchanged, gold/fed unchanged, stall counter incremented, `townLastGrowthTickAtByKey` still advanced.
- Town at `maxPopulation`: no growth, no food spent (logistic ceiling).

---

## Phase 3 — Explicit tier-upgrade command (food-paid)

**Goal:** replace silent threshold promotion with a deliberate player command that spends the farm bank.

### 3a. Remove auto-upgrade from `tickPopulationGrowth`

**File:** `apps/simulation/src/runtime.ts`, inside `tickPopulationGrowth` (lines ~1045–1076). Remove the automatic tier promotion:
- Delete the `nextTier` computation block (lines 1046–1049):
  ```ts
  const nextTier = newPopulation >= 5_000_000 ? "METROPOLIS" as const
    : newPopulation >= 1_000_000 ? "GREAT_CITY" as const
    : newPopulation >= 100_000 ? "CITY" as const
    : "TOWN" as const;
  ```
- In the `updatedTown` spread (lines 1055–1059), remove `...(nextTier !== town.populationTier ? { populationTier: nextTier } : {})` so population grows but tier is NOT auto-promoted.
- Remove the tier-index update block (lines 1071–1076, `if (nextTier !== town.populationTier) { … summary.ownedTownTierByTile.set(…) }`).
- Population still grows and remains the **eligibility gate** for upgrading; it just no longer auto-promotes. Re-read the method after editing to confirm it still compiles and the `_clearPause` destructure / population write remain intact.

### 3b. New `UPGRADE_TOWN_TIER` command

Mirror the existing `WORLD_ENGINE_STRIKE` command end-to-end. Reference handler: `handleWorldEngineStrikeCommand` at runtime.ts:5656–5777.

1. **Command type registration** — add `"UPGRADE_TOWN_TIER"` to all three places that list command types:
   - `packages/sim-protocol/src/command-coverage-sets.ts` (near line 26–32, alongside `SIPHON_TILE`/`WORLD_ENGINE_STRIKE`).
   - `packages/client-protocol/src/index.ts` (near line 28–34, same neighbors).
   - `packages/shared/src/messages.ts` (the zod command union, near line 133–153). Add a tile-targeted schema:
     ```ts
     z.object({ type: z.literal("UPGRADE_TOWN_TIER"), x: z.number().int(), y: z.number().int(), ...FrontierCommandMetadataSchema }),
     ```

2. **Payload parser** — reuse `parseTilePayload` (already imported in runtime.ts at line 233; used by `handleCollectTileCommand` at 4464). No new parser needed.

3. **Constants** — in `packages/game-domain/src/server-game-constants.ts` add:
   ```ts
   export const TIER_UPGRADE_FOOD_COST: Record<"CITY" | "GREAT_CITY" | "METROPOLIS", number> = { … };
   ```
   Large per-tier lumps (the farm-bank sink). The tier thresholds are CITY=100k, GREAT_CITY=1M, METROPOLIS=5M population. Cost should be a meaningful multiple of typical farm-bank accumulation; start conservative and tune in end-to-end.

4. **Handler** — add `handleUpgradeTownTierCommand(command: CommandEnvelope)` near the other command handlers in runtime.ts. Follow the WorldEngineStrike pattern (parse → validate → spend → mutate → emit `TILE_DELTA_BATCH`; reject with `COMMAND_REJECTED` on any failure):
   - `const actor = this.players.get(command.playerId); const payload = parseTilePayload(command.payloadJson);` — reject `BAD_COMMAND` if either missing.
   - Resolve the tile via `simulationTileKey(payload.x, payload.y)`; reject if not found, not owned by `actor`, not `ownershipState === "SETTLED"`, or no `tile.town`.
   - Determine the current tier and its next step: SETTLEMENT→TOWN→CITY→GREAT_CITY→METROPOLIS. Reject (`code: "UPGRADE_TOWN_TIER_INVALID"`, message "already at max tier") if there is no next step.
   - Reject if `town.population` is below the next tier's threshold (CITY 100k / GREAT_CITY 1M / METROPOLIS 5M) — message "population too low to upgrade".
   - `if (!this.spendStrategicResource(actor, "FOOD", TIER_UPGRADE_FOOD_COST[nextTier])) { emit COMMAND_REJECTED "insufficient FOOD"; return; }`
   - On success: write `{ ...town, populationTier: nextTier }` onto the tile, update `summary.ownedTownTierByTile` for that tile key (mirror the index update that lines 1072–1076 used to do), invalidate `tileDeltaStringifyCache`, emit `TILE_DELTA_BATCH`, and invalidate the player's economy caches (`economySnapshotCacheByPlayer` / `tileYieldContextCacheByPlayer`) since tier affects goldPerMinute.

5. **Dispatch registration** — in the command dispatch chain in runtime.ts (the `if (command.type === …)` ladder around line 8865+), add:
   ```ts
   if (command.type === "UPGRADE_TOWN_TIER") {
     this.handleUpgradeTownTierCommand(command);
     return;
   }
   ```

### 3c. Client

- Add a town **"Upgrade"** action: `packages/client/src/client-player-actions.ts` and `packages/client/src/client-network.ts` (mirror how an existing tile-targeted command like SETTLE or a structure build is sent). The button should be enabled only when the town is owned, SETTLED, has a next tier, and population ≥ the next threshold; show the food cost.
- **Bump `packages/client/src/client-changelog.ts`** (version + entry) — REQUIRED by the pre-push hook for any `packages/client/src/` change. Forgetting this blocks the push.

### 3d. AI (low priority, can be a follow-up)

- Add a simple "upgrade when affordable & eligible" hook in the AI planner so AI players keep pace. If time-constrained, note it as a follow-up rather than blocking the PR.

**Tests:** add to `runtime.population-growth.test.ts` (or a new `runtime.upgrade-town-tier.test.ts`):
- Success: eligible town with enough food → tier promoted, food deducted, tier index updated.
- Insufficient food → `COMMAND_REJECTED`, no promotion, no food spent.
- Below population threshold → rejected.
- At max tier → rejected.

---

## Phase 4 — Farmstead & Waterworks (farm-only)

**Goal:** make the two food structures actually boost FARM food; FISH stays unimprovable.

**File:** `apps/simulation/src/tile-yield-view.ts`, `converterDailyOutput` (lines 59–75). It currently handles only FUR/IRON/CRYSTAL synthesizers. The food structures need to ADD a food bonus when active on/adjacent to a FARM tile.

1. First confirm the exact application rule: read how the existing synthesizers apply their bonus (on-tile via `tile.economicStructure` vs. adjacency) — `converterDailyOutput` is called at line 123 with `tile.economicStructure?.status === "active" ? tile.economicStructure.type : undefined`. So today it's an **on-tile active structure**. Determine whether Farmstead/Waterworks are meant to apply on-tile or to adjacent FARM tiles (check the original structure intent in `packages/shared/src/structure-costs.ts` lines 37–44 and any existing references to `FARMSTEAD`/`WATERWORKS`). Match the synthesizer mechanism unless the structure definition clearly says adjacency.
2. Wire FARMSTEAD and WATERWORKS to add a food bonus (intended +50%) **only when the underlying/target resource is FARM**. Apply the bonus to the FARM food yield, not as a flat add unrelated to the tile's farm output.
3. **Explicitly do nothing for FISH.** Add a guard + one-line comment so a fish tile never receives a structure food bonus, and so this stays intentional against future edits.
4. Build costs already exist in `structure-costs.ts` — this phase is purely wiring the yield bonus, not adding costs.

**Tests:** Farmstead/Waterworks on a FARM tile raises FARM food above the `72/day` base; the same structure has NO effect on a FISH tile.

---

## Out of scope

- War/recovery food sink (deferred to a future phase).
- Worldgen food-cluster changes (#457 closed). Revisit cluster counts only if needed after this lands.

## Verification (do all of these)

1. **Unit tests:** the Phase 1–4 tests above, all green.
2. **Types/build:** `tsc --noEmit` (or the repo's build) in `packages/game-domain`, `apps/simulation`, `packages/client`, and the protocol packages. Remember Docker tsc is stricter — prefer a clean build.
3. **Sim perf gates:** run them; they flake on a loaded local box (encirclement/frontier-decay/tick-automation wall-clock gates) — CI re-runs them, so a local flake isn't a blocker, but a real regression is.
4. **End-to-end in the real app (project rule — run it, don't just unit-test):** seed a world and confirm:
   - (a) fish towns never build a food bank;
   - (b) farm towns accumulate food;
   - (c) a food-starved growing town stops growing but still earns gold;
   - (d) the Upgrade button spends food + promotes, and rejects when broke or below threshold;
   - (e) Farmstead/Waterworks raise farm food and have zero effect on fish;
   - (f) the new "growth food cost/min" figure shows in the economy panel.
5. Confirm no regression in `buildFedTownKeys` gold output.

## Rollout

- Worktree + feature branch off `main` (never the primary checkout).
- One PR after self-review.
- **Ask the human before merge and before deploy** (each separately). Never archive the work before it deploys.
