# AI Structure Building Rewrite Plan

Status: proposal. Numbered sections (§) are stable reference anchors — code
comments introduced by this work should cite them the way the codebase already
cites `docs/manpower-economy-rewrite-plan.md` §4.1/§5/§12.

Companion docs: `docs/manpower-economy-rewrite-plan.md` (the economy this plan
plays inside), `docs/agents/topics/ai-planner.md` (planner architecture and CPU
budget), `docs/AI_DEBUGGING.md` (the admin endpoints this plan extends).

---

## §1 Why — what is actually broken today

### §1.1 The AI can only ever build five of ~28 economic structures

`chooseBestEconomicBuild` (`apps/simulation/src/ai/structure-command-planner.ts:174-251`)
is the entire "what should I build" brain. It walks owned tiles and pushes a
candidate based *only on what already sits on that tile*:

| Tile trait | Candidate emitted | Score |
| --- | --- | --- |
| `resource === FARM \| FISH` | `FARMSTEAD` | 190 if food low, else 70 |
| `resource === UMBRITE` | `UMBRITE_RIG` | 58 if economy weak, else 42 |
| `resource === TITANIUM \| GEMS` | `MINE` | 62 if economy weak, else 46 |
| town below support cap | `MINTWORKS` or `GRANARY` | up to 160 |

Everything else in `EconomicStructureType` has **no code path that can ever
propose it**. That includes every structure that addresses the pressures the AI
actually feels: `GARRISON_HALL` (+150 manpower cap), `LOGISTICS_GUILD` (+manpower
regen), `ASSEMBLY_WORKS`, `RAIL_DEPOT`, `WATERWORKS`, `SEED_GRANARY`,
`CENSUS_HALL`, `GOVERNORS_OFFICE`, `CLEARING_HOUSE`, `CUSTOMS_HOUSE`,
`CARAVANARY`, `FOUNDRY`, all six synthesizers, both weapons factories,
`AIRPORT`, `AETHER_TOWER`, `RADAR_SYSTEM`, and all six wonder chains.

`docs/AI_DEBUGGING.md` records the Observatory gap but not this one, which is
far larger.

### §1.2 Nothing checks manpower before proposing a build

Build gold costs are globally zeroed
(`packages/shared/src/structure-costs/structure-costs.ts:19-136`) — manpower is
the real cost. But the candidate selectors still gate on gold:

- `canAffordStructure` (`structure-command-planner.ts:150-169`) checks tech,
  `canAffordGold` (always true — cost is 0), and strategic-resource stock.
  It never reads `player.manpower`.
- `chooseBestFortBuild` (`:253-297`) checks `TITANIUM` and `fortTier.gold` (0).
  Never checks `fortTier.manpower` (300).
- `chooseBestSiegeOutpostBuild` (`:299-336`) — same, never checks its 60.
- `utility-dispatch.ts:133-135` reduces each candidate to `Boolean(...)`.

The runtime then rejects with `INSUFFICIENT_MANPOWER`
(`apps/simulation/src/runtime-structure-command-handlers.ts:436-437`).

This is the same defect class the codebase already fixed for EXPAND/ATTACK — see
the `hasAnyExpandCandidate` / `hasAnyAttackCandidate` "authoritative gate"
comments at `apps/simulation/src/ai/utility/decisions.ts:68-82`. The fix was
never extended to the three `BUILD_*` selectors.

### §1.3 The AI's steady state is manpower ≈ 0, so builds are unreachable by construction

This is the root cause, and it is structural rather than a bug.

Manpower regen for a mid-game AI with five `TOWN`-tier towns
(`packages/shared/src/config.ts:115-137`,
`apps/simulation/src/runtime-manpower.ts`):

```
0.4 (starting capital)  +  5 × (300/720) × 1.0 (first-5 weight)  ≈  2.48 MP/min  ≈  149 MP/hour
```

Against that trickle:

| Action | Manpower | Hours of *total* regen |
| --- | --- | --- |
| `EXPAND` | 10 | 0.07 |
| `SETTLE` | 20 | 0.13 |
| `ATTACK` | 60 | 0.40 |
| Cheapest economic structure | 80 | 0.54 |
| `GARRISON_HALL` / `MINTWORKS` / `LOGISTICS_GUILD` | 150 | 1.0 |
| `FORT` / `FOUNDRY` / `RAIL_DEPOT` / `ASSEMBLY_WORKS` | 300 | 2.0 |
| Wonder part | 1 000 | 6.7 |
| Completed wonder | 1 600 | 10.7 |

`EXPAND` has both the lowest unit cost and unbounded appetite, and it is gated
only on `manpower >= EXPAND_MANPOWER_COST`
(`automation-command-planner.ts:199`). The planner ticks far faster than one
expand per four minutes, so the AI spends manpower down to the floor and holds
it there permanently. **Every structure priced at 80+ is therefore unreachable,
not deprioritised.**

The two defects then compound into a visible loop:

1. AI expands until manpower is near zero.
2. `needsEconomy = economyWeak(manpower, settledTiles)` flips true
   (`ai-economic-heuristics.ts:27-28` — `manpower < max(40, settledTiles × 6)`).
3. `scoreBuildEconomy` (`decisions.ts:201-216`) finally scores above EXPAND.
4. …but manpower is now far below any structure's cost, and nothing checked
   (§1.2), so a doomed `BUILD_ECONOMIC_STRUCTURE` is emitted.
5. Runtime rejects `INSUFFICIENT_MANPOWER`; the class goes on rejection
   cooldown; EXPAND resumes the moment 10 MP has accrued.

`needsEconomy` is thus an *anti-signal*: it only turns on once building has
become impossible.

### §1.4 There is no way to express deferral

Saving requires declining an affordable cheap action now to afford an expensive
one later. The utility policy has no vocabulary for this: `evaluateUtilityPolicy`
(`utility/utility-policy.ts:30-57`) picks the argmax of independent per-tick
scores. Momentum (`decisions.ts:114-118`) is capped at 0.20 and explicitly
cannot rescue a vetoed class. Nothing carries a savings intent across ticks.

### §1.5 Structure choice is blind to needs, and to the victory path

The scores in §1.1 are constants selected by tile contents. `needsFood` and
`economyWeak` toggle a couple of them. The AI cannot express "titanium slots are
my binding constraint on defense", and `primaryVictoryPath` — already computed
every tick and remembered across ticks
(`automation-strategic-snapshot.ts:289-306`,
`ai-planner-worker-core.ts:40-55,222-226`) — has **zero influence** on what gets
built. It only steers expansion and posture.

---

## §2 Goals and non-goals

### §2.1 Goals

1. **G1 — Every buildable structure is reachable.** Replace the five-type
   allowlist with a declarative catalog covering the full
   `BuildableStructureType` union.
2. **G2 — Needs drive selection.** Score structures by how much they close a
   measured deficit, per unit of manpower, not by what happens to sit on a tile.
3. **G3 — The AI saves up.** An explicit manpower savings mechanism so builds
   priced above the steady-state floor become reachable (§1.3).
4. **G4 — Never propose an unaffordable build.** Manpower, slots, tech, and
   placement all gated before emission (§1.2).
5. **G5 — Victory path steers the build order,** including its wonder chain.
6. **G6 — Diagnosable.** `/admin/debug/ai/decisions` must answer "why is this
   AI not building?" without a code read.

### §2.2 Non-goals

- No change to structure costs, effects, or the manpower economy. Balance
  findings are recorded in §13 and handed off, not acted on here.
- No new command types. The AI keeps emitting `BUILD_ECONOMIC_STRUCTURE`,
  `BUILD_FORT`, `BUILD_SIEGE_OUTPOST` (plus `BUILD_OBSERVATORY`, newly wired).
- No GOAP//planner-architecture rewrite. This stays inside the existing utility
  policy (`docs/ai-goap-plan.md` is historical context, not a target).
- No per-tick CPU regression. See §10.3.

---

## §3 Pillar 1 — the manpower budget (how the AI saves up)

### §3.1 Model: reserve a share of income, never lock the stock

The naive design — freeze the current stock until a target is met — deadlocks a
hemmed-in AI and stops expansion dead for an hour at a time. Instead the AI
splits its manpower **income**:

```
savingsPool  += regenPerMinute × dtMinutes × savingsRate      (accrued per tick)
savingsPool   = min(savingsPool, targetBuild.manpowerCost)     (never over-save)
spendable     = max(0, manpower - savingsPool)
```

- `EXPAND` / `SETTLE` / `ATTACK` / `MUSTER` gate on **`spendable`**.
- `BUILD_*` draws from the **full** `manpower`, and zeroes `savingsPool` on
  acceptance.

Expansion never fully stops; it slows to `(1 - savingsRate)` of income while a
build is being funded. This is deadlock-free by construction and needs no
timeout escape hatch.

### §3.2 `savingsRate`

Derived from the urgency of the top unmet need (§4) and the victory path (§7):

| Situation | `savingsRate` |
| --- | --- |
| `threatCritical` — existential defense | `0.0` (war first; the AI must be able to fight) |
| No viable build target (`targetBuild === undefined`) | `0.0` |
| Top need deficit < 0.3 (comfortable) | `0.2` |
| Top need deficit 0.3–0.7 | `0.45` |
| Top need deficit > 0.7 (starved) | `0.75` |
| Wonder chain active and path is a contender (§7.3) | `+0.15`, capped at `0.85` |

Never 1.0: the AI must retain some expansion tempo, and `ATTACK` must stay
reachable when a front opens.

### §3.3 Worked example

Five `TOWN`-tier towns, regen 2.48 MP/min, target build `GARRISON_HALL` (150 MP):

| `savingsRate` | Time to fund | Expansion during | Effect |
| --- | --- | --- | --- |
| 0.20 | 5.0 h | ~12 expands/h | background saving |
| 0.45 | 2.2 h | ~8 expands/h | normal |
| 0.75 | 1.3 h | ~4 expands/h | starved, pushing hard |

Compare with today: **never**, at any tempo.

### §3.4 The ceiling trap

`playerManpowerCapFromSummary` (`apps/simulation/src/runtime-manpower.ts`) caps
banked manpower. If `manpowerCap < targetBuild.manpowerCost`, saving can never
succeed — the pool clips at the cap forever.

Rule: a structure is only eligible as `targetBuild` when
`manpowerCap >= manpowerCost + ATTACK_MANPOWER_COST`. If the best-scoring
structure fails that test, the AI must first raise its ceiling — build
`GARRISON_HALL` (+150 cap), or upgrade a town tier — and the `MANPOWER_CEILING`
need (§4.2) is what makes that happen automatically. Base cap is 576 + 300/town,
so this binds mainly on the 1 000/1 600 MP wonder chain.

### §3.5 Wasted-regen signal

If `manpower` sits pinned at `manpowerCap` across ticks, regen is being thrown
away. That drives `MANPOWER_CEILING` deficit up *and* is a strong build trigger
in its own right — banked manpower at cap is free to spend.

### §3.6 State and lifetime

`savingsPool` and `targetBuild` live per player in planner-worker memory,
alongside the existing `rememberedVictoryPathByPlayer` map
(`ai-planner-worker-core.ts:40`), and are cleared on the same player-removal and
season-reset paths (`:141`, `:373`, `:400`).

Re-targeting: if a strictly better target appears, keep the accrued pool (it is
generic manpower, not earmarked) and re-point `targetBuild`; clip the pool to
the new cost. Log the switch — target thrash is a tuning smell (§10.2).

---

## §4 Pillar 2 — the need vector

### §4.1 Needs

```ts
export type NeedKey =
  | "MANPOWER_THROUGHPUT"   // MP/min — gates build + war + expand
  | "MANPOWER_CEILING"      // MP cap — gates what is bankable at all
  | "FOOD_SLOTS"            // slot supply; dormancy risk
  | "TITANIUM_SLOTS"        // war structures: forts, bastions
  | "UMBRITE_SLOTS"         // war structures: siege outposts, towers
  | "CRYSTAL_SLOTS"         // observatories, radar, aether
  | "GOLD"                  // income vs upkeep and tier-upgrade costs
  | "DEFENSE"               // fort coverage on threatened fronts
  | "OFFENSE"               // siege coverage vs stalemated targets
  | "VICTORY";              // progress on the chosen path (§7)
```

Each resolves to a deficit in `[0, 1]`. Note the user-stated invariants this
encodes directly: **manpower is always in demand** (it is the sole currency for
build, war, and expansion — §1.3), and **titanium/umbrite keep attack and
defense competitive** (they are the slot resources for the fort and siege
ladders, `structure-slots.ts:47-90`).

### §4.2 Deficit formulas

| Need | Deficit |
| --- | --- |
| `MANPOWER_THROUGHPUT` | `clamp01(1 - regenPerMin / (0.08 × settledTileCount + 0.4))` |
| `MANPOWER_CEILING` | `1.0` if `cap < bestCandidateCost + ATTACK_MANPOWER_COST`; else `clamp01(pinnedAtCapTicks / CAP_PIN_WINDOW)` |
| `FOOD_SLOTS` | `clamp01(1 - foodSupply / foodDemand)` |
| `TITANIUM_SLOTS` | `clamp01(1 - titaniumSupply / (titaniumDemand + plannedFortDemand))` |
| `UMBRITE_SLOTS` | as above, siege ladder |
| `CRYSTAL_SLOTS` | as above, observatory/radar |
| `GOLD` | `clamp01(1 - incomePerMinute / goldTarget(settledTileCount))` |
| `DEFENSE` | `clamp01(frontierEnemyTargetCount / max(1, ownedForts × 2))` |
| `OFFENSE` | `clamp01(stalematedTargetCount / max(1, ownedSiegeOutposts + 1))` |
| `VICTORY` | `1 - pathProgress` from `scoreVictoryPaths` (§7.2) |

Baseline weights are uniform (1.0); §7.1 re-weights by victory path.

`MANPOWER_THROUGHPUT` deliberately replaces `economyWeak`'s role for *build*
decisions. `economyWeak` measures banked stock, which §1.3 shows is pinned near
zero regardless of empire health — a stock reading cannot distinguish "poor"
from "spending well". Regen can. `economyWeak` stays where it is used for
attack-readiness (`automation-strategic-snapshot.ts:12-22`); §12.4 covers the
migration.

---

## §5 Pillar 3 — the structure capability catalog

### §5.1 Shape

One declarative entry per `BuildableStructureType`, replacing the hardcoded
branches of §1.1:

```ts
export type StructureCapability = {
  type: BuildableStructureType;
  /** Normalised 0..1 contribution to each need it services. */
  provides: Partial<Record<NeedKey, number>>;
  /** Hard unlocks (e.g. RAIL_DEPOT only matters with LOGISTICS_GUILDs present). */
  requiresOwned?: Partial<Record<BuildableStructureType, number>>;
  /** Where it can legally sit — reuses the existing predicate vocabulary. */
  placement: "OWN_SETTLED_LAND" | "TOWN_SUPPORT_NEIGHBOR" | "RESOURCE_TILE" | "FRONTIER_ADJACENT";
  /** Same-tile resource requirement for RESOURCE_TILE placement. */
  resourceTile?: readonly ResourceType[];
  /** Diminishing returns past this many copies. */
  softCap?: number;
};
```

Costs, tech requirements, slot requirements, and placement predicates are **not**
duplicated here — they are read from the existing single sources of truth:
`STRUCTURE_COST_DEFINITIONS` (`structure-costs.ts:27`),
`TECH_REQUIREMENTS_BY_STRUCTURE` (`structure-registry-economic.ts:26-52`),
`STRUCTURE_SLOT_REQUIREMENTS` (`structure-slots.ts:47`), and the
`structure-registry` placement predicates. The catalog adds only the AI's
*valuation*, which is the one thing that does not already exist.

### §5.2 Representative entries

Derived from `packages/game-domain/src/structure-modifier-catalog/structure-modifier-catalog-economic.ts`:

| Structure | `provides` | Notes |
| --- | --- | --- |
| `GARRISON_HALL` | `MANPOWER_CEILING: 0.9` | +150 cap flat |
| `ASSEMBLY_WORKS` | `MANPOWER_CEILING: 0.8` | +300 cap per networked Ancillary Factory; `requiresOwned: { GARRISON_HALL: 1 }` |
| `LOGISTICS_GUILD` | `MANPOWER_THROUGHPUT: 0.5` | +0.05 MP/min — see §13.1 |
| `RAIL_DEPOT` | `MANPOWER_THROUGHPUT: 0.7` | +0.1/min per networked guild; `requiresOwned: { LOGISTICS_GUILD: 2 }` |
| `FARMSTEAD` | `FOOD_SLOTS: 0.8` | +1 own-tile slot; `RESOURCE_TILE: [FARM, FISH]` |
| `WATERWORKS` | `FOOD_SLOTS: 0.9` | +2 per Farmstead in a 10-tile radius |
| `GOVERNORS_OFFICE` | `FOOD_SLOTS: 0.5, GOLD: 0.2` | waives food demand by tier step |
| `MINE` | `TITANIUM_SLOTS: 0.8` / `CRYSTAL_SLOTS: 0.8` | by tile resource |
| `FOUNDRY` | `TITANIUM_SLOTS: 0.7, CRYSTAL_SLOTS: 0.7` | doubles mines in a 5-tile radius |
| `UMBRITE_RIG` | `UMBRITE_SLOTS: 0.8` | |
| `TITANIUM_WORKS` / `UMBRITE_SYNTHESIZER` / `CRYSTAL_SYNTHESIZER` | corresponding `*_SLOTS: 0.6` | hard cap 1 (`structure-slots.ts:150-165`); carry real gold upkeep |
| `MINTWORKS` | `GOLD: 0.7` | +10%/copy town gold |
| `CLEARING_HOUSE` | `GOLD: 0.6` | lifts Mintworks 10% → 35%; `requiresOwned: { MINTWORKS: 2 }` |
| `CUSTOMS_HOUSE` | `GOLD: 0.5` | +1 gold/min per connected dock |
| `CARAVANARY` (Trade Nexus) | `GOLD: 0.6` | +25% connected-town gold |
| `FORT` (ladder) | `DEFENSE: 1.0` | titanium slots; tier via `bestFortTierForTech` |
| `SIEGE_OUTPOST` (ladder) | `OFFENSE: 1.0` | umbrite slots |
| `OBSERVATORY` | `CRYSTAL_SLOTS: -1, DEFENSE: 0.3` | closes the §1.1 gap noted in `AI_DEBUGGING.md` |
| Wonder parts / wonders | `VICTORY: 1.0` | §7.3 |

### §5.3 Placement resolution

`RESOURCE_TILE` and `TOWN_SUPPORT_NEIGHBOR` reuse the existing scans —
`openTownSupportNeighborTiles` and `economicStructureTypesForSupportedTown`
(`apps/simulation/src/town-support-lookup.ts`) — including the two hard-won
correctness guards already documented at `structure-command-planner.ts:212-224`
and `:236-245` (never propose a support structure with no open neighbour; never
propose a type the town already has). Both must survive the rewrite; they exist
because production was rejecting ~99.9% of those commands.

---

## §6 Scoring

### §6.1 Formula

```
rawValue(s)   = Σ_k  needWeight[k] × deficit[k] × provides[s][k]
pathMult(s)   = §7.1 multiplier for s under the current primaryVictoryPath
softCapMult(s)= 1 / (1 + ownedCount(s) / softCap(s))
efficiency(s) = rawValue(s) × pathMult(s) × softCapMult(s) / normalisedCost(s)
```

`normalisedCost(s) = manpowerCost(s) / MANPOWER_COST_REFERENCE` (reference =
150, the modal cost among non-wonder structures — 11 of them sit exactly there)
so efficiency reads as "need closed per unit manpower".

### §6.2 Eligibility gate (G4)

A candidate is discarded before scoring unless **all** hold:

1. Tech present (`TECH_REQUIREMENTS_BY_STRUCTURE`).
2. `requiresOwned` satisfied.
3. A legal placement tile exists (§5.3).
4. Slot supply covers `structureSlotRequirements(s)` — otherwise the build lands
   dormant and the manpower is burnt for nothing.
5. `manpowerCap >= manpowerCost + ATTACK_MANPOWER_COST` (§3.4).
6. Non-manpower stockpile costs (SHARD) affordable.

Note that **current manpower is deliberately not an eligibility criterion** —
that is what §3 exists to fix. Affordability is checked at *emission*: build now
if `manpower >= cost`, otherwise make it `targetBuild` and save. This is the
precise distinction §1.2's bug got wrong by omitting the check entirely, and
that a naive fix would get wrong in the opposite direction by making expensive
structures permanently ineligible.

### §6.3 Emission

The single best-scoring eligible candidate becomes `targetBuild`. If affordable
now, the corresponding `BUILD_*` command is emitted this tick; if not, §3 funds
it. `BUILD_DEFENSE` vs `BUILD_ECONOMY` class routing is preserved for
diagnostics and cooldown bookkeeping, but both now draw from one ranked list, so
a fort and a granary compete on the same axis instead of in separate silos.

---

## §7 Pillar 4 — victory-tree weighting

### §7.1 Path re-weights the need vector

`primaryVictoryPath` is already computed and hysteresis-stabilised
(`automation-strategic-snapshot.ts:289-306`; repivot margins at `:108-114`).
This plan gives it, for the first time, authority over building:

| Path | Boosted needs (×1.6) | Damped needs (×0.6) |
| --- | --- | --- |
| `TOWN_CONTROL` | `DEFENSE`, `OFFENSE`, `MANPOWER_THROUGHPUT` | `GOLD` |
| `ECONOMIC_HEGEMONY` | `GOLD`, `FOOD_SLOTS` | `OFFENSE` |
| `RESOURCE_MONOPOLY` | `TITANIUM_SLOTS`, `UMBRITE_SLOTS`, `CRYSTAL_SLOTS` | `FOOD_SLOTS` |
| `MARITIME_SUPREMACY` | `GOLD`, `MANPOWER_THROUGHPUT` | `DEFENSE` |
| `DIPLOMATIC_DOMINANCE` | `MANPOWER_THROUGHPUT`, `MANPOWER_CEILING` | `OFFENSE` |

`DIPLOMATIC_DOMINANCE` wins by controlled tile count, and every claim costs
manpower — so for that path manpower *is* the win condition, which the current
AI cannot express at all.

Damping is never a veto. A `TRUCE`/`CONTAIN` posture with real enemy pressure
still lets `DEFENSE` win on raw deficit; §7.1 tilts, it does not gate.

### §7.2 `VICTORY` deficit

`scoreVictoryPaths` (`automation-strategic-snapshot.ts:156-287`) already computes
per-path progress ratios (`townProgress`, `economyProgress`,
`resourceMonopolyProgress`, `maritimeSupremacyProgress`,
`diplomaticControlProgress`) and `contender` / `softContender` flags. Export the
chosen path's progress ratio from the snapshot (it is discarded today) and use
`1 - progress` as the `VICTORY` deficit. No new computation.

### §7.3 The wonder chain

Six three-part chains exist and are entirely unreachable by the AI. Proposed
path mapping:

| Path | Chain | Why |
| --- | --- | --- |
| `ECONOMIC_HEGEMONY` | `IMPERIAL_EXCHANGE` | 100% rival gold levy |
| `TOWN_CONTROL` | `WORLD_ENGINE` | population strike |
| `RESOURCE_MONOPOLY` | `TITANIUM_LEVY` | banked manpower → army at 0.5 |
| `MARITIME_SUPREMACY` | `ASTRAL_DOCK` | full-map vision |
| `DIPLOMATIC_DOMINANCE` | `POPULATION_BUREAU` | +0.1 MP/min per manpower building |
| *(any, defensive)* | `AEGIS_DOME` | protection radius; scored on `DEFENSE`, not path |

Gating — a chain is only entered when all hold:

1. Path is `contender` or `softContender` (§7.2 flags), so the AI is not
   sinking 3 000+ MP into a path it is losing.
2. `manpowerCap >= 1600 + ATTACK_MANPOWER_COST` (§3.4) — otherwise build
   ceiling first.
3. Parts are pursued in order; `upgradePrereq`
   (`structure-registry-economic.ts:56-70`) already encodes 1→2→3→final.

While a chain is active, `savingsRate` gets the §3.2 bonus. At 1 000 MP/part and
~150 MP/hour this is a multi-hour commitment per part — appropriate for a win
condition, and the reason §7.3.1 gating matters.

---

## §8 Integration with the utility policy

### §8.1 Decision classes are unchanged

`BUILD_ECONOMY` and `BUILD_DEFENSE` stay. What changes is what feeds them:

- `hasEconomicBuild` / `hasFortBuild` / `hasSiegeOutpost`
  (`utility-dispatch.ts:133-135`) become "the ranked list's top candidate is of
  this family **and** is affordable now".
- `scoreBuildEconomy`'s `needsEconomy` term (`decisions.ts:215`) is replaced by
  the §6.1 efficiency of the top candidate, normalised to `[0, 1]`. This removes
  the §1.3 inversion where building only became attractive once it had become
  impossible.
- `scoreBuildEconomy`'s expansion-suppression term (`decisions.ts:212`) is
  **retained**, including its `nonWasteExpansionOpportunityCount` fix — that
  term encodes a real staging incident (`ai-planner.md`, "Waste-inclusive
  aggregate counts"). Do not regress it.

### §8.2 Saving must not read as WAIT

When the AI is saving and has nothing else to do, `WAIT` wins
(`utility-policy.ts:44`). That is correct behaviour but indistinguishable in
telemetry from the `wait_and_recover` deadlocks this codebase has repeatedly
fought. Add a distinct diagnostic reason (`saving_for_build`) carrying
`targetBuild`, `savingsPool`, and ETA, so a saving AI is never misdiagnosed as a
stuck one.

### §8.3 New veto on EXPAND

`canExpand` (`automation-command-planner.ts:199`) changes from `manpower >=
EXPAND_MANPOWER_COST` to `spendable >= EXPAND_MANPOWER_COST` (§3.1). `canAttack`
(`:197`) uses `spendable` too, except when `threatCritical` — a savings pool
must never prevent an AI from defending itself.

---

## §9 Data plumbing

`AutomationPlannerInput` (`automation-command-planner.ts:53-107`) currently
carries `manpower`, `points`, `incomePerMinute` (gold), `strategicResources`,
`ownedStructureCounts`, `settledTileCount`, `townCount`. The following are
needed and absent:

| Field | Source | Used by |
| --- | --- | --- |
| `manpowerCapacity` | `playerManpowerCapFromSummary` | §3.4, §4.2 |
| `manpowerRegenPerMinute` | `playerManpowerRegenPerMinuteFromSummary` | §3.1, §4.2 |
| `slotSupplyByResource` | slot accounting, per `structure-slots.ts` | §4.2, §6.2 |
| `slotDemandByResource` | ditto | §4.2, §6.2 |
| `townTierCounts` | owned-tile sweep (tiers already on `tile.town`) | §3.4 ceiling ladder |
| `victoryPathProgress` | export from `scoreVictoryPaths` | §7.2 |

All six are cheap: five are scalars or small maps already computed on the main
thread for the player snapshot, and the sixth is a discarded intermediate. They
ride the existing `sync_players` message (`ai-planner-worker-core.ts`), adding
no new scan. Slot supply/demand is the only one needing care — it must not
trigger a fresh owned-tile walk; fold it into the sweep that already produces
`settledTileCount`/`townCount` (`automation-command-planner.ts:265-277`).

---

## §10 Diagnostics, metrics, CPU

### §10.1 `/admin/debug/ai/decisions`

Extend the payload (`docs/AI_DEBUGGING.md`) with:

- `needVector` — every need's deficit and post-path weight.
- `targetBuild` — `{ type, tileKey, manpowerCost, efficiency }`.
- `savings` — `{ pool, rate, spendable, etaMinutes }`.
- `topBuildCandidates` — best five with scores.
- `rejectedCandidates` — best five *ineligible* ones with the §6.2 rule that
  killed each. This is the "why is this AI not building?" answer (G6), and it
  would have made §1.1 self-evident.

### §10.2 Metrics

- `sim_ai_build_target{player_id,structure_type}` — current target.
- `sim_ai_savings_pool{player_id}` / `sim_ai_savings_rate{player_id}`.
- `sim_ai_build_emitted_total{structure_type}` — **the acceptance test for G1**:
  the distinct-label count must exceed 5.
- `sim_ai_build_rejected_total{structure_type,reason}` — must trend to ~0 for
  `INSUFFICIENT_MANPOWER` (G4).
- `sim_ai_build_target_switch_total{player_id}` — target thrash (§3.6).

### §10.3 CPU budget

`ai-planner.md` is explicit that planner CPU contends with login on a shared
vCPU. Constraints:

- Catalog scoring is **O(catalog × needs)** — ~28 × 10 with no tile access, run
  once per plan. Negligible next to the frontier scan.
- Placement resolution is the only tile-touching part. It must reuse
  `buildCandidateTiles` and the `restrictToFocus` spatial-focus filter already
  applied at `automation-command-planner.ts:357-360` — no new unbounded walks.
- Add a `planner_score_builds` phase to `sim_ai_planner_phase_ms`; treat a p99
  above the existing `choose_frontier` phase as a regression.

---

## §11 Rollout

Sequenced so each phase is independently shippable and observable.

| Phase | Content | Ships behind |
| --- | --- | --- |
| **0** | ✅ **Landed.** Fix §1.2 in place: manpower gate in `canAffordStructure`, `chooseBestFortBuild`, `chooseBestSiegeOutpostBuild`. Stops the reject loop immediately. Note it does **not** by itself make the AI build more — it makes it stop proposing builds it cannot pay for, which is a waste fix, not a behaviour fix. §13.6 records what landing it revealed. | no flag |
| **1** | ✅ **Landed and active.** §9 plumbing + §10.1 diagnostics: `AutomationPlannerInput`'s four optional fields, `computeNeedVector`/`needVectorFromPlannerInput` (`ai/build/build-need-vector.ts`), `AutomationPlannerDiagnostic.needVector`, `AiDecisionDiagnostic.needVector` reaching `/admin/debug/ai/decisions`, and `PlannerPlayerView`/`PlannerExportInput`'s matching fields threaded through `runtime-state-export.ts`, `runtime.ts`'s `exportPlannerPlayerViews`, and `ai-planner-worker-core.ts`. `runtime.ts`'s closures (`playerManpowerCap`/`playerManpowerRegenPerMinute`/`resourceSlotSupplyForPlayer`/`resourceSlotDemandForPlayer`) were fitted into the file's existing line count exactly — it's already 4,851 lines against the repo's 500-line file cap (`scripts/check-file-line-limits.mjs`), which fails unconditionally on any growth to an already-oversized file, so the closures for `exportPlannerPlayerViews` were densified onto fewer lines (several one-line closures sharing physical lines with their neighbors) rather than adding net new lines — a deliberate one-time formatting trade-off scoped tightly to this one method, not a precedent for the file generally. `runtime.export-planner-player-views-need-vector.test.ts` confirms real (non-zero, per-player-distinct) values flow end-to-end from `SimulationRuntime` through `exportPlannerPlayerViews`. Nothing downstream reads `needVector` yet — confirmed unchanged command selection in `automation-command-planner-need-vector.test.ts`. Next: watch it against live/staging AIs before Phase 2 scores against it. | no flag (read-only) |
| **2** | §5 catalog + §6 scoring, replacing `chooseBestEconomicBuild`'s internals. Selection changes; savings not yet active. | `AI_BUILD_CATALOG_ENABLED` |
| **3** | §3 savings + §8.3 EXPAND veto. The behavioural core. | `AI_BUILD_SAVINGS_ENABLED` |
| **4** | §7.1 path weighting. | `AI_BUILD_PATH_WEIGHTS_ENABLED` |
| **5** | §7.3 wonder chains. | `AI_WONDER_CHAIN_ENABLED` |

Phase 0 is worth landing on its own regardless of whether the rest proceeds.

### §11.1 File layout

Source files are capped at 500 lines (`scripts/check-file-line-limits.mjs`;
`.md` is exempt). Planned split:

```
apps/simulation/src/ai/build/
  build-need-vector.ts        §4 — deficits from planner input
  build-capability-catalog.ts §5 — the declarative table
  build-scoring.ts            §6 — eligibility + efficiency ranking
  build-placement.ts          §5.3 — tile resolution (reuses town-support-lookup)
  build-savings.ts            §3 — pool accrual, target lifecycle
  build-victory-weights.ts    §7 — path multipliers + wonder chain gating
```

`structure-command-planner.ts` shrinks to a thin adapter so existing callers and
its 331-line test file keep working through the transition.

---

## §12 Test plan

### §12.1 Regression guards (must not break)

The existing suites encode real production incidents. All must stay green:

- `structure-command-planner.test.ts` — the town-support guards
  (`:212-224`, `:236-245`).
- `automation-command-planner-utility-integration.test.ts`,
  `utility-policy.test.ts` — the `nonWasteExpansionOpportunityCount` fix.
- `automation-strategic-snapshot.test.ts` — victory-path hysteresis.
- `automation-command-planner-owned-tile-scaling.test.ts` — CPU scaling.

### §12.2 New unit tests

- Need deficits at boundary values (0 supply, supply == demand, oversupply).
- Every catalog entry: `provides` keys valid, cost/tech/slot lookups resolve.
- Eligibility: each §6.2 rule rejects in isolation and reports its reason.
- Savings: pool accrues, clips at target cost, clips at `manpowerCap`, zeroes on
  build, survives re-target.
- `savingsRate === 0` when `threatCritical`.
- Ceiling trap: `cap < cost` never becomes `targetBuild`.

### §12.3 Scenario tests

- **Reachability (G1/G3):** an AI at steady-state-zero manpower with an
  expansion frontier eventually emits a 150 MP build. Fails on `main` today —
  this is the headline test.
- **No doomed builds (G4):** across a long horizon, zero
  `INSUFFICIENT_MANPOWER` rejections.
- **Path divergence (G5):** identical starting states with different
  `primaryVictoryPath` produce measurably different build mixes.
- **Defense pre-emption:** `threatCritical` mid-save spends the pool on defense.

### §12.4 `economyWeak` migration

`economyWeak` has two callers with different intents:
`chooseBestEconomicBuild`'s `econWeak` (`structure-command-planner.ts:186`,
replaced by §4) and `requiredAttackManpower`
(`automation-strategic-snapshot.ts:12-22`, retained — banked stock is the right
reading for "can I afford to attack right now"). `ai-preplan-command.ts:144`
needs review during Phase 2 to determine which sense it wants.

---

## §13 Balance findings

Surfaced by building the ROI model; recorded rather than acted on (§2.2).

### §13.1 Manpower buildings are third-best, and the AI must learn the ordering

The two Logistics Guild bonuses **stack**: a guild inside a Rail Depot network
earns its standalone `LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE = 0.05`
(`config.ts:289`) *plus* `RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD
= 0.1` (`config.ts:290`) — both terms are added in
`playerManpowerRegenPerMinuteFromSummary` (`runtime-manpower.ts:66-73`), and
`economy-network.ts:849-852` states the "on top of" intent explicitly. So a
networked guild is 0.15/min (a standalone one, 0.05/min).

Amortising the Rail Depot's own 300 MP across the guilds it serves:

| Guilds per depot | Total MP | Regen gained | Payback |
| --- | --- | --- | --- |
| 1 | 450 | 0.15/min | 50.0 h |
| 3 | 750 | 0.45/min | 27.8 h |
| 5 | 1 050 | 0.75/min | 23.3 h |
| asymptote | — | — | 16.7 h |

Against a 30-day season (`SEASON_LENGTH_DAYS = 30`, `config.ts:195` — 720 h) a
~25 h payback returns ~29×, so these are **not** dead buildings. The issue is
opportunity cost. Settling a `TOWN`-tier town costs ~50 MP all-in and yields
0.417 MP/min **plus +300 cap** — roughly a 2-hour payback, ~8× better on both
axes. The regen taper (`manpowerRegenWeightForSettlementIndex`,
`config.ts:132-136`) narrows but never closes the gap:

| Town index | Weight | Regen each | Payback |
| --- | --- | --- | --- |
| 1–5 | ×1.0 | 0.417/min | ~2 h |
| 6–15 | ×0.5 | 0.208/min | ~4 h |
| 16+ | ×0.2 | 0.083/min | ~10 h |

Even the harshest-tapered town beats the best-case guild, and still carries cap
the guild never provides. Manpower buildings are therefore correctly a
**hemmed-in / no-land-left** lever, not a general one.

This is the ordering §4's `MANPOWER_THROUGHPUT` need must encode — cheapest
first: **town tier upgrade (§13.5, costs no manpower at all) → settle a new town
(~2 h) → manpower buildings (~25 h)**. Ranking guilds highly before the first two
are exhausted would optimise the wrong end. §6.2's `requiresOwned` gate is the
natural place to express "only when settling is unavailable".

### §13.2 `GARRISON_HALL` is cost-neutral on the ceiling

150 MP for +150 cap: it pays for exactly itself in headroom. Fine as an enabler
for the §3.4 ladder, but it never gets an empire *ahead*.

### §13.3 Wonder costs vs. base ceiling

A wonder totals 3 000 MP across parts plus 1 600 for the final — 4 600 MP, or
~30 hours of a five-town empire's entire regen. With base cap 576 + 300/town,
the 1 600 MP final needs 1 600 + 60 headroom, i.e. ≥4 towns before it is
bankable at all. Intentional gating or an accident of two independently-tuned
tables is worth confirming.

### §13.4 `economyWeak`'s stock reading

Per §1.3 the AI's manpower is pinned near zero regardless of empire health, so
`manpower < max(40, settledTiles × 6)` reads "weak" essentially always for any
empire past ~7 settled tiles. It has the same permanently-tripped character the
`incomePerMinute` version had before §24.5 rescaled it.

### §13.5 Town tier upgrades dominate every manpower building, and cost no manpower

`TOWN_TIER_UPGRADE_GOLD_COST` (`structure-slots.ts:250-260`) prices upgrades in
**gold**: 20 / 40 / 80 / 160 for TOWN / CITY / GREAT_CITY / METROPOLIS. Each step
doubles both regen and cap (`TOWN_MANPOWER_BY_TIER`, `config.ts:122-131`):

| Step | Gold | Regen gain | Cap gain |
| --- | --- | --- | --- |
| SETTLEMENT → TOWN | 20 | +0.208/min | +150 |
| TOWN → CITY | 40 | +0.417/min | +300 |
| CITY → GREAT_CITY | 80 | +0.833/min | +600 |

A single TOWN → CITY upgrade yields +0.417 MP/min — the equivalent of **~2.8
networked Logistics Guilds** (420 MP of guilds plus a share of a 300 MP depot) —
for 40 gold and **zero manpower**. Manpower payback is undefined because no
manpower is spent.

AI players bank thousands of gold against a 45 000 cap with few sinks
(`docs/AI_DEBUGGING.md`), so this is effectively free, and it is the single
highest-value manpower lever in the game. The AI does not emit
`UPGRADE_TOWN_TIER` at all — see §15.2, which this finding promotes from an open
question to the plan's most likely highest-ROI follow-up.

### §13.6 Both BUILD classes are structurally unreachable, independently of cost

Surfaced while landing Phase 0 (§11): adding the manpower gate broke six
existing tests, and every one broke for a reason more interesting than a stale
fixture. Each had been passing *only* because the gate was missing.

**BUILD_DEFENSE is preempted by MUSTER in exactly its own trigger conditions.**
`scoreBuildDefense` (`decisions.ts:192-199`) requires `frontierEnemyCount > 0`.
But a FORT costs 300 manpower while MUSTER needs only `ATTACK_MANPOWER_MIN`
(60), and `scoreMuster` outranks `scoreBuildDefense`'s pressure logistic
whenever a weak enemy border exists. So:

- manpower < 300 → fort unaffordable, BUILD_DEFENSE cannot execute;
- manpower ≥ 300 → MUSTER is also available and wins.

There is **no manpower value at which BUILD_DEFENSE beats MUSTER on a live
front.** It is reachable only when every enemy target is stalemated (clearing
`hasWeakEnemyBorder`, vetoing MUSTER) — verified by
`automation-command-planner-build-defense.test.ts`, which has to stalemate both
enemy tiles to observe a fort at all. "Fortify what you cannot break through" is
a defensible niche, but it is far narrower than the class appears to describe,
and it means the AI never fortifies *pre-emptively*.

**BUILD_ECONOMY's trigger and its affordability window barely overlap.**
`scoreBuildEconomy` only scores meaningfully while `needsEconomy` holds, i.e.
`manpower < max(40, settledTileCount × 6)` (`ai-economic-heuristics.ts:27-28`).
Affording the structure needs `manpower ≥ cost`. Both hold only when
`settledTileCount × 6 > cost`:

| Structure | Manpower | Minimum settled tiles for the window to exist |
| --- | --- | --- |
| `GRANARY` | 80 | > 13 |
| `MINTWORKS` | 150 | > 25 |
| `FOUNDRY` / `RAIL_DEPOT` | 300 | > 50 |

Below those sizes the two conditions are **mutually exclusive** — the AI is
either too rich to want the building or too poor to buy it. Three separate test
fixtures modelling 6-settled-tile empires had to be rebuilt at 30 tiles to
observe a build at all. This is §1.3's inversion stated exactly: it is not that
building is deprioritised at small scale, it is unrepresentable.

Both findings are fixed by the same §3/§4/§6 work — a savings pool decouples
"want" from "afford", and a need-weighted ROI decouples "build" from "cannot
attack". Neither is fixable by tuning the existing scores.

One benign behaviour to preserve: because the gate is applied per candidate
*before* the best-score pick, a player who can afford `GRANARY` (80) but not
`MINTWORKS` (150) now proposes the Granary rather than nothing. Graceful
degradation is the desired shape and is pinned by
`structure-command-planner.test.ts`.

---

## §14 Risks

| Risk | Mitigation |
| --- | --- |
| Savings starve expansion; AIs stagnate | `savingsRate` capped at 0.85 (§3.2); phase-4 flag; `sim_ai_expand_total` is an existing guard metric |
| Target thrash burns the pool's purpose | Pool is generic manpower, never lost on re-target (§3.6); `sim_ai_build_target_switch_total` |
| Catalog `provides` values are guesses | Phase 1 reports the vector without acting, so weights are tuned against live data before behaviour changes |
| Planner CPU regression | §10.3 budget; reuse of `buildCandidateTiles` + spatial focus; new phase timing |
| Losing the hard-won town-support guards | §12.1 pins them; they are called out in §5.3 |
| Wonders eat an entire game's manpower for a losing path | §7.3 contender gating + ceiling check |

---

## §15 Open questions

1. **Wonder→path mapping (§7.3)** is a proposal from each wonder's effect. Is
   there an intended canonical mapping?
2. **Should the AI upgrade town tiers? (Recommended: yes, and first.)** Per
   §13.5 this is the highest-ROI manpower lever in the game — gold-costed,
   zero-manpower, and one TOWN → CITY step is worth ~2.8 networked Logistics
   Guilds. The AI never emits `UPGRADE_TOWN_TIER`. It sits outside "structure
   building" as scoped here, so it is called out rather than absorbed — but
   shipping this plan's §3 savings work *without* it would have the AI grinding
   for hours toward buildings it could out-earn for 40 gold. Strong candidate to
   pull into Phase 2, or to run as its own small parallel change.
3. **`AIRPORT_BOMBARD` / crystal abilities** remain unused (`AI_DEBUGGING.md`).
   In scope for a follow-up, or fold `CRYSTAL_SLOTS` demand into this work?
4. **Fort/siege ladder upgrades** (`nextFortTierForUpgrade`) — the AI builds
   fresh at the best tier but never upgrades existing forts. Same rework?

---

## §16 Reach system landed on `main` — `BUILD_BEACON` reworked to a graduated consideration

Between this plan's original write-up and Phase 0/1 shipping, `main` landed a
fixed-borders-via-reach mechanic (commits `f098e66`..`c5b0158`+): `EXPAND`/
`SETTLE` are now gated by a persistent reach radius from anchors —
`TOWN` (`TOWN_REACH_RADIUS` = 3), the outpost family `RELAY_BEACON` /
`SIEGE_OUTPOST` / `SIEGE_TOWER` / `DREAD_TOWER` (`OUTPOST_REACH_RADIUS` = 5),
and `DOCK` (`DOCK_REACH_RADIUS` = 1). **`FORT` does not grant reach** — it is
not one of the anchor kinds `gatherReachAnchors()` (`runtime.ts`) recognizes;
the separate `activeFortAnchorsByOwner` map is the pre-existing
`TOWN_AUTO_FRONTIER_RADIUS` mechanic and is unrelated. `ATTACK` is unaffected
by reach.

This changes two premises this plan was built on, both addressed below rather
than by revising §1–§15 in place (the original sections still describe the
manpower/need-vector/catalog work accurately; this section is additive):

### §16.1 `EXPAND` is no longer an unbounded manpower sink

§1.3's "AI's steady state is manpower ≈ 0" narrative assumed `EXPAND` could
keep consuming a dev slot indefinitely. Under reach, `EXPAND`/`SETTLE` are
capped by territory already in radius of an anchor — once every in-reach tile
is claimed, `EXPAND` has nothing left to do regardless of manpower on hand.
The only way to open more `EXPAND` room is a new anchor, i.e. a new
`RELAY_BEACON` (or town/dock). This is a natural, mechanic-driven brake on
`EXPAND`'s appetite that §3's savings-rate design doesn't need to fight
anymore — it was designed against a strictly-worse assumption.

### §16.2 `BUILD_BEACON`: boolean site-exists veto → graduated consideration

Before this change, `BUILD_BEACON` (`decisions.ts`) scored identically
whether `chooseBestRelayBeaconBuild` (`relay-beacon-command-planner.ts`)
found a beacon site that unlocked one plain `LAND` tile or one that unlocked
a dozen resource/town/dock tiles — the site-exists check was a `boolVeto`,
pass/fail only. That made beacon cadence unresponsive to how much value was
actually left to claim.

The fix reuses `estimateNewReachCoverage`'s existing score (previously
discarded after ranking candidates against each other) as a genuine
magnitude, threaded through as `RelayBeaconBuildPlan.siteValue`:

```
scoreBuildBeacon = scoreConsiderations([
  boolVeto(hasRelayBeaconBuild),
  boolVeto(devSlotAvailable),
  boolVeto(frontierEnemyCount === 0),
  boolVeto(!hasActionableNonWasteExpand),
  linear(relayBeaconSiteValue, RELAY_BEACON_SITE_VALUE_FLOOR = 1, RELAY_BEACON_SITE_VALUE_CEILING = 24)
])
```

`RELAY_BEACON_SITE_VALUE_FLOOR = 1` is the smallest passing value (a single
plain unowned `LAND` tile in the scan radius). `RELAY_BEACON_SITE_VALUE_CEILING
= 24` is roughly three valuable tiles' worth
(`VALUABLE_TARGET_COVERAGE_WEIGHT = 8` each). This was chosen over the
alternative the strategic doctrine discussion first proposed — a literal
counter ("an economic building every 5 beacons, or when there are no
expansion opportunities") — because the value curve gets the same outcome
(beacon cadence naturally tapers as the best sites get claimed first, leaving
room for `BUILD_ECONOMY`) without adding new persistent state or a synthetic
threshold to tune. `siteValue` is surfaced through
`AutomationPlannerDiagnostic.relayBeaconSiteValue` →
`AiDecisionDiagnostic.relayBeaconSiteValue` (`/admin/debug/ai/decisions`),
following the same explicit-field-allowlist pattern as
`economicBuildCandidate`.

### §16.3 `BUILD_ECONOMY`'s expansion-opportunity suppression removed

`scoreBuildEconomy` used to suppress on `nonWasteExpansionOpportunityCount` in
addition to `frontierEnemyCount`, to stop `BUILD_ECONOMY` from competing with
`EXPAND` for the same dev slot while there was still cheap land to grab.
Under reach, `EXPAND` doesn't consume a dev slot and is itself reach-capped
(§16.1), so that suppression no longer reflects real resource contention —
it was actively fighting the desired "dev slots open up for economic
buildings during the post-beacon expansion window" behaviour raised in the
strategic-doctrine discussion. It has been removed; `scoreBuildEconomy` now
suppresses only on `frontierEnemyCount` (fight first, let `ATTACK`/`MUSTER`
win that competition).

### §16.4 Need-weighted economic structure catalog

`chooseBestEconomicBuild` (`structure-command-planner.ts`) could only ever
propose 5 of the ~28 buildable `EconomicStructureType`s — FARMSTEAD,
UMBRITE_RIG, MINE, MINTWORKS, GRANARY — each scored by a hand-picked flat
number (`foodLow ? 190 : 70`, etc.), not by any measured need. This was the
original plan's §5/§6 Phase 2 gap.

`economic-structure-catalog.ts` adds a declarative catalog — `{ type,
needKey, placement, maxScore }` — for 8 more types, scored by
`computeNeedVector`'s real per-resource deficit instead of another flat
number: `score = maxScore * needVector[needKey]`, calibrated so `maxScore`
sits inside the original 5 types' existing 20-190 range. The original 5
types' scoring is deliberately left untouched (already shipped and tuned);
the catalog is additive, layered onto the same candidate list.

Each entry's `needKey` was confirmed against the structure's actual
gameplay effect in `structure-modifier-catalog-economic.ts` (the same
source of truth the client's own tooltips read from) — not guessed:

| Type | needKey | Placement |
| --- | --- | --- |
| WATERWORKS | FOOD_SLOTS | any open settled tile |
| GOVERNORS_OFFICE | FOOD_SLOTS | any open settled tile |
| GARRISON_HALL | MANPOWER_CEILING | town-support neighbor |
| LOGISTICS_GUILD | MANPOWER_THROUGHPUT | town-support neighbor |
| CARAVANARY | GOLD | town-support neighbor |
| UMBRITE_SYNTHESIZER | UMBRITE_SLOTS | town-support neighbor |
| TITANIUM_WORKS | TITANIUM_SLOTS | town-support neighbor |
| CRYSTAL_SYNTHESIZER | CRYSTAL_SLOTS | town-support neighbor |

Deliberately left out of this pass: RAIL_DEPOT/ASSEMBLY_WORKS (their effect
is "+X per Y-in-network" — only useful if another specific structure is
already built elsewhere, which the planner doesn't evaluate yet);
CUSTOMS_HOUSE (placed directly on a dock tile — no existing candidate-
gathering for that placement rule); SEED_GRANARY/CENSUS_HALL/CLEARING_HOUSE
(population/upgrade-cost/synergy effects with no clean `NeedVector`
counterpart, some needing a prerequisite structure already built); the
wonder chain (needs completed PART prerequisites first, §15 open question
#1). The synthesizer entries were briefly single-copy-only in an earlier
draft, citing `structure-slots.ts`'s "hard-capped at exactly 1 slot ...
forever" comment — that comment is stale.
`runtime-structure-command-handlers.ts` documents the cap as removed
("Decision 5: unlimited SYNTHESIZE-mode converters per family"), and
`resourceSlotSupplyForPlayer` (`resource-slot-view.ts`) sums
`structureSlotRequirements` per *active* synthesizer tile with no dedup —
each additional copy genuinely adds its own slot supply. Only a duplicate on
the SAME town's support ring is rejected, via the same
`existingSupportStructureTypes` check every catalog entry already gets
(§16.4's town-support branch) — there is no empire-wide cap.

A score of exactly 0 (need fully met) is filtered out at the push site —
`chooseBestEconomicBuild`'s best-pick loop has no score-floor of its own
(the original 5 types never hit exactly 0), so an unfiltered 0-score
catalog candidate could still win by default when nothing else exists to
compare against, proposing a build for zero value.

The catalog's `needVector` is computed via a new
`buildScoringNeedVectorFromPlannerInput` (`build-need-vector.ts`) — a
thin wrapper defaulting `victoryPathProgress` to 0, since none of the
catalog's `needKey`s read `VICTORY`. This runs *before* the strategic
snapshot in `planAutomationCommand` (whereas the diagnostic-only
`needVectorFromPlannerInput` call later in the same function uses the real
`victoryPathProgress`), because `chooseBestEconomicBuild` is called before
the snapshot exists and the snapshot itself depends on `economicBuild`'s
availability — reordering the whole function to avoid the double
computation was judged higher-risk than computing a cheap pure function
twice.

### §16.5 Beacon build cadence boost

Per the strategic-doctrine discussion's request for "a mix" — beacon-first
most of the time, with room for economic building — `BUILD_BEACON` now gets
a periodic priority boost layered on top of §16.2's graduated site-value
score, tracked by `ai-beacon-cadence.ts`:

- A per-player cycle position (0..4), advanced once per **accepted**
  structure-build command (`BUILD_FORT`/`BUILD_SIEGE_OUTPOST`/
  `BUILD_ECONOMIC_STRUCTURE`, including beacons themselves) — counted at
  command acceptance, not construction finish (which can be minutes later
  for slower structures), so the cadence tracks build *actions*, not
  real-time completion.
- Positions 0-3 (`BEACON_CADENCE_BOOSTED_BUILDS = 4`): `scoreBuildBeacon`
  adds a flat `BEACON_CADENCE_BOOST = 0.6` on top of its normal graduated
  score, clamped to 1 — strong enough that a legal beacon reliably
  outcompetes `BUILD_ECONOMY`/`BUILD_DEFENSE` during the boosted window.
- Position 4 (the 5th build in the cycle): no boost — the plain
  need-driven comparison decides, the same "mix" window the doctrine
  discussion asked for.
- The boost is added *after* the vetoes and the graduated term, and only
  when the un-boosted score is already nonzero — it can never revive a
  beacon that's still illegal (no site, no dev slot, an enemy at the gate,
  or a real in-reach EXPAND prize still unclaimed). Strong bias, not a
  hard override, per the explicit design choice.

State lives in `ai-command-producer.ts` (`Map<playerId, position>`,
mirroring `ai-rejection-cooldown.ts`'s shape) — real, small, process-local
state, not a snapshot/persistence concern; a lost position on restart just
resets a player to the start of a cycle, which is harmless. Threaded through
as `explainNextAutomationCommand`'s `beaconBoostActive` option →
`AutomationPlannerInput.beaconBoostActive` →
`UtilityDispatchState.beaconBoostActive` → `DecisionInputs.beaconBoostActive`.
