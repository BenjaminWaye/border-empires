# AI Economic Synergy Plan

Status: Phases 1–5 implemented 2026-11-03 (BenjaminWaye/border-empires#2589). Phase 0
(production baseline) and the staging income comparison are still open.

Companion docs: [`ai-structure-building-rewrite-plan.md`](ai-structure-building-rewrite-plan.md)
(need vector and catalog this plan extends; §13.1 has the manpower-building
ROI table), [`product/resource-and-manpower-economy.md`](product/resource-and-manpower-economy.md)
(live economy rules), [`agents/ai-guardrails.md`](agents/ai-guardrails.md)
(CPU rules every phase must respect), [`AI_DEBUGGING.md`](AI_DEBUGGING.md).

## Goal

Teach the AI the two stacking "engine" combos a strong human builds:

- **Coin engine:** Manufactory (stacks per town) + Clearing House (raises every
  Manufactory in the network) + Trade Nexus (switches on the connected-town
  bonus for the whole network).
- **Manpower engine:** Ancillary Depot (stacks per town) + Reserve Lattice
  (raises every Depot in the network), and Ancillary Factory (one per town,
  across many towns) + Neural Works (amplifies every Factory in the network).

The AI should choose each building by its *marginal* value given what is
already in the town and network, instead of a flat score per type.

## What the rules actually do (grounded)

| Building | Placement / limit (server) | Effect |
| --- | --- | --- |
| Manufactory | `same_tile`, **stacks per town** (`STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES`, `packages/shared/src/structure-stacking/`) | +10% town coin per copy, +35% per copy with a Clearing House in the town or connected network; +1 coin/day flat each (`manufactoryGoldProductionMultiplier`, `server-game-constants.ts`) |
| Clearing House | `town_support`, one per town; one per network is enough | Lifts every Manufactory in the town and connected towns from +10% to +35% (`player-update-economy.ts` `clearingHouseActive`) |
| Trade Nexus | `town_support`, one per town; one per network is enough | Gates the connected-town bonus: +50% / +40% / +30% for the 1st–3rd connected town, multiplicative with Manufactory (`economy-network.ts` `networkHasTradeNexus`) |
| Ancillary Depot | `same_tile`, **stacks per town** | Each copy: +150 cap + 10% of the town's terrain-adjusted base cap, or +35% with a Reserve Lattice in the network (`ancillaryFactoryCapacityBonus`, `town-terrain-profile.ts`) |
| Reserve Lattice | `town_support`, one per network (runtime-enforced) | The 10% → 35% Depot lift above |
| Ancillary Factory | `town_support`, **one per town** (singleton gate); stacks across towns | +0.05 manpower/min each standalone; +0.10 more each inside a Neural Works network (`runtime-manpower.ts`) |
| Neural Works | `town_support`, one per network (runtime-enforced) | The +0.10/Factory amplification above |

Worked example: a CITY with 3 Manufactories, a Clearing House in its network,
a Trade Nexus and 3 connected towns earns `(1 + 3×0.35) × (1 + 1.2) ≈ 4.5×`
base town coin. A town with one Manufactory and nothing else earns 1.1×.

Naming hazard: `ancillaryFactoryCapacityBonusByTown` /
`ancillaryFactoryCapacityBonus` count **Ancillary Depots**, and Reserve
Lattice's tooltip says "Ancillary Factory local capacity rate" for the same
Depot effect. Implementation must read the code, not the identifiers.

## What the AI did before this plan (the gaps)

All in `apps/simulation/src/ai/structure-command-planner.ts`
(`chooseBestEconomicBuild`) and `apps/simulation/src/ai/build/economic-structure-catalog.ts`.

1. **Stacking was blocked.** `existingSupportStructureTypes?.has(candidate.type)`
   skipped any type the town already had, so the AI never built a 2nd
   Manufactory, Ancillary Depot or Aether Condenser at a town.
2. **Clearing House, Neural Works and Reserve Lattice were never proposed.**
3. **Manufactory had a flat score of 54**, ignoring town size, existing copies
   and Clearing House state.
4. **Trade Nexus was placed blindly** — scored only by the global `GOLD`
   deficit, so it could land in an isolated town or next to another one.
5. **Ancillary Depot / Factory were scored only by need**, not by town size or
   whether the amplifier was in reach.
6. **The planner had no network awareness** — planner tiles carry no
   connected-town data.

## What shipped

### 1. One shared stacking rule (Phase 1)

`packages/shared/src/structure-stacking/structure-stacking.ts` holds
`STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES` (renamed from
`STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES`),
`STACKING_TOWN_SUPPORT_STRUCTURE_TYPES` and `structureStacksPerTown(type)`.
The runtime's `resolveTownSupportTarget` and the planner's singleton skip
(`!structureStacksPerTown(type) && existing.has(type)`) both read it. If
[`stacking-adjacency-plan.md`](stacking-adjacency-plan.md) ships, it changes
this module, not the planner.

### 2. Town-economy view (Phase 2)

`apps/simulation/src/ai/build/town-economy-view.ts` defines `TownEconomyEntry`
— one per owned TOWN-tier-or-higher town:

```ts
type TownEconomyEntry = {
  townKey: string;
  baseGoldWeight: number;          // tier × terrain coin multiplier
  baseManpowerCap: number;         // terrain-adjusted, for the Depot formula
  manufactories: number;           // built + under construction
  ancillaryDepots: number;
  hasAncillaryFactory: boolean;
  connectedTownCount: number;
  connectedTownBonus: number;      // live; 0 without a Trade Nexus in reach
  tradeNexusInReach: boolean;
  clearingHouseInReach: boolean;
  neuralWorksInReach: boolean;
  reserveLatticeInReach: boolean;
  ancillaryFactoriesInReach: number;
  depotTownsInReach: number;
};
```

**Deviation from the proposal:** there is no `networkId` / per-network entry.
The economy's connected-town relation is per town and deliberately not
transitive through other towns (`buildConnectedTownNetworkForPlayer`), so
"in reach" means *this town or a town it is connected to*, read straight from
that town's `ConnectedTownNetworkEntry`. Neighbour Manufactory counts are not
in that entry, so the Clearing House estimate uses the empire average
Manufactories per town for connected towns.

Connected towns' network entries list only *active* amplifiers, so each entry
also reports `amplifiersUnderConstruction`; the scorer holds that amplifier
type back empire-wide until it finishes (≤ 60 s build), which stops two
connected towns both building a Clearing House or Trade Nexus.

Built on the main thread by `apps/simulation/src/runtime/runtime-town-economy-view.ts`
from the cached town network (rebuilt uninstrumented on a miss, like the
manpower bonus path) plus one support-ring scan per town; memoised per network
object, which `runtime-economy-cache-invalidation.ts` replaces on every
economy-relevant tile write. A planner-export miss rebuilds the network via the
instrumented `cachedTownNetworkForPlayer`; the 1 s metrics tick never rebuilds
(it reuses the player's last view). Towns are ranked and capped at 64 (richest
first) before the ring scans, so scan cost is bounded by the cap. Exported via
`PlannerPlayerView.townEconomy` → worker → `AutomationPlannerInput.townEconomy`
→ `StructurePlannerPlayer.townEconomy`, and on the in-process advisor path.
Tests: `town-economy-view.test.ts` (including a traversal bound and the cap),
`runtime-town-economy-view.test.ts` (memoisation).

### 3. Marginal-value scoring (Phases 3–4)

`apps/simulation/src/ai/build/economic-synergy-scoring.ts`, called from
`build/town-support-candidates.ts` (the town-support block extracted from
`chooseBestEconomicBuild`). When a town has a view entry these replace the
flat Manufactory score and the catalog's Trade Nexus / Depot / Factory
entries; without one the old scoring is unchanged.

| Candidate | Eligible when | Gain | Score |
| --- | --- | --- | --- |
| Manufactory | not food-low | `(CH ? 0.35 : 0.10) × (1 + connectedBonus) × baseGoldWeight` | coin |
| Clearing House | none in reach; ≥ 2 Manufactories in reach (own + connected × empire average) | `0.25 × manufactoriesInReach × (1 + connectedBonus) × baseGoldWeight` | coin |
| Trade Nexus | none in reach; ≥ 1 connected town | `ladder(connected) × manufactoryMult × baseGoldWeight × (1 + connected)` | coin |
| Ancillary Depot | `MANPOWER_CEILING` > 0 | `150 + baseCap × (RL ? 0.35 : 0.10)` | `150 × ceiling × (0.5 + 0.5 × gain/300)` |
| Reserve Lattice | none in reach; ≥ 2 Depots in reach | `0.25 × baseCap × depotsInReach` | `150 × ceiling × min(1, gain/300)` |
| Ancillary Factory | town has none; `MANPOWER_THROUGHPUT` > 0 | `0.05 + (NW ? 0.10 : 0)` | `160 × throughput × (0.6 + 0.4 × gain/0.15)` |
| Neural Works | none in reach; ≥ 2 Factories in reach | `0.10 × factoriesInReach` | `160 × throughput × min(1, gain/0.3)` |

Coin score = `54 + 96 × min(1, gain) × (0.5 + 0.5 × GOLD need)`: the floor is
the old flat Manufactory score and the ceiling (150) stays below the
food-crisis Incubation Engine (160) and Hydrogarden (190). Placement among
towns falls out of the scores (richer towns win stacking types); the proposed
"singleton in the town with most open tiles" tie-break was not needed.

Observed build order (`structure-command-planner-synergy-sequence.test.ts`,
two connected towns): Trade Nexus → Manufactory ×2 → Clearing House →
Manufactory ×4, with no duplicate amplifier.

### 4. Linking towns (Phase 5)

`evaluateSettlementCandidate` (EXPAND target scoring; the AI has no SETTLE
decision of its own) already gave +110 to frontier tiles within two tiles of
two owned towns. It now adds `TOWN_LINK_VALUE_BONUS` (+80) when one of those
towns is in `linkValueTownKeys(view)`: below the 3-town bonus cap and with a
Trade Nexus in reach or ≥ 2 Manufactories. Computed once per planning call.

## Diagnostics

- `/admin/debug/ai/decisions` records gain `economicBuildScore` (the winning
  candidate's score; `economicBuildCandidate` keeps its `x,y:TYPE` format) and
  `economicSynergy`: a fixed-size empire summary (`towns`, `manufactories`,
  `ancillaryDepots`, `ancillaryFactories`, `connectedTowns`,
  `townsWith{TradeNexus,ClearingHouse,NeuralWorks,ReserveLattice}InReach`).
  **Deviation:** no per-network list and no runner-up — kept fixed-size so the
  100-record history stays bounded.
- `/admin/runtime/metrics` gains `sim_ai_player_synergy{player_id,kind}`, one
  gauge per summary field per AI player, from the existing 1 s AI metrics row.

## Phases

0. **Baseline** — *open.* Pull production `/admin/debug/ai`,
   `/admin/debug/ai/decisions` and `/admin/players` for every AI. Needs
   `api.borderempires.com` allowed in the agent environment's network
   settings. After deploy, `sim_ai_player_synergy` and `economicSynergy`
   show directly whether AIs are building the engines.
1. **Stacking fix** — delivered. Tests: `structure-command-planner-stacking.test.ts`.
2. **Town-economy view** — delivered.
3. **Coin engine scoring** — delivered. Tests: `economic-synergy-scoring.test.ts`,
   `structure-command-planner-synergy.test.ts`, `-synergy-sequence.test.ts`.
4. **Manpower engine scoring + diagnostics** — delivered. Tests as above plus
   `economic-synergy-diagnostics.test.ts`, `metrics-ai-synergy-prometheus.test.ts`.
5. **Town-link bonus** — delivered. Tests: `ai-settlement-priority-town-link.test.ts`.

All phases shipped in one PR at the owner's request rather than one PR each.
Verify on staging by sampling `/admin/players` income per AI and
`sim_ai_player_synergy` over a few hours.

## Release notes and lore

- AI opponents get noticeably richer and field more manpower. Changelog
  entry: `packages/client/src/client-changelog/client-changelog-ai-stacked-industry.ts`.
- Lore reviewed; no canon change (AI behaviour only, no change to what any
  structure means).
- No map overlays or highlights, so renderer parity does not apply.

## Decisions

- **Applies to every AI** (owner decision, 2026-11-02). No difficulty or
  personality gate: synergy scoring is the single economic build path for
  all AI players. Barbarian/system players are unaffected — they use the
  separate frontier-only planner and never build economic structures.

## Open questions

- Ordering with [`stacking-adjacency-plan.md`](stacking-adjacency-plan.md): if
  adjacency ships first, Phase 1's placement must pick a tile touching an
  existing same-family building.
