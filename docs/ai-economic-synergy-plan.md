# AI Economic Synergy Plan

Status: proposed (2026-11-02). Nothing here is implemented yet.

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
| Manufactory | `same_tile`, **stacks per town** (`STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES`, `runtime-structure-town-support-target.ts`) | +10% town coin per copy, +35% per copy with a Clearing House in the town or connected network; +1 coin/day flat each (`manufactoryGoldProductionMultiplier`, `server-game-constants.ts`) |
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

## What the AI does today (the gaps)

All in `apps/simulation/src/ai/structure-command-planner.ts`
(`chooseBestEconomicBuild`) and `apps/simulation/src/ai/build/economic-structure-catalog.ts`.

1. **Stacking is blocked.** `existingSupportStructureTypes?.has(candidate.type)`
   skips any type the town already has. That is right for singleton types and
   wrong for the stackers, so the AI never builds a 2nd Manufactory, a 2nd
   Ancillary Depot, or a 2nd Aether Condenser at a town.
2. **Clearing House, Neural Works and Reserve Lattice are never proposed** —
   the catalog excludes them as "synergy effects with no clean NeedVector
   counterpart". So both amplifiers are missing.
3. **Manufactory has a flat score of 54** and only competes as the non-food
   branch of `foodLow ? INCUBATION_ENGINE : MANUFACTORY`. It ignores town
   size, existing copies and Clearing House state.
4. **Trade Nexus is placed blindly.** Scored only by the global `GOLD` deficit
   (`maxScore 120`). It can land in an isolated town (zero effect) or in a
   network that already has one (zero marginal effect), while networks that
   need one get none.
5. **Ancillary Depot / Factory are scored only by need**, not by town size
   (Depot value scales with the town's base cap) or by whether the network has
   the amplifier.
6. **No placement awareness of networks.** Planner tiles
   (`AutomationPlannerTile.town`) carry no network id, connected-town count or
   per-network structure counts, so none of the above can be computed today.

## Design

### 1. One shared stacking rule

Move `STACKING_SUPPORT_STRUCTURE_TILE_REDIRECT_TYPES` and
`STACKING_TOWN_SUPPORT_STRUCTURE_TYPES` from
`runtime-structure-town-support-target.ts` into `packages/shared` (a small
`structure-stacking.ts` exporting `structureStacksPerTown(type)`), and add
`structureIsNetworkSingleton(type)` for Neural Works / Reserve Lattice (runtime
enforced) plus "one is enough" types Trade Nexus / Clearing House (AI-only
avoidance). Runtime and AI both import it, so they can never disagree again.
If [`stacking-adjacency-plan.md`](stacking-adjacency-plan.md) ships, it
changes this module, not the planner.

### 2. Town-economy view for the planner (cheap, bounded)

New `apps/simulation/src/ai/build/town-economy-view.ts`. Built on the runtime
side from data that already exists — `townNetworkCacheByPlayer`
(`ConnectedTownNetworkEntry`), the player summary's `ownedTownTierByTile`, and
the per-town structure tallies — and passed into the planner input next to
`slotSupplyByResource` (same plumbing path: `planner-world-view.ts` →
`ai-planner-worker-core.ts` → `automation-command-planner.ts`). It must be
plain serialisable data because the planner runs in a worker.

```ts
type TownEconomyEntry = {
  townKey: string;
  networkId: string;            // stable per connectivity group
  tier: PopulationTier;
  baseGoldPerMinute: number;    // tier × terrain × support, before structure mults
  baseManpowerCap: number;      // terrain-adjusted, for the Depot formula
  openSupportTiles: number;
  manufactories: number;
  ancillaryDepots: number;
  hasAncillaryFactory: boolean;
  singletonTypes: EconomicStructureType[]; // town_support types present
};
type NetworkEconomyEntry = {
  networkId: string;
  townCount: number;            // TOWN tier or higher
  hasTradeNexus: boolean;
  hasClearingHouse: boolean;
  hasNeuralWorks: boolean;
  hasReserveLattice: boolean;
  manufactories: number;
  ancillaryDepots: number;
  ancillaryFactories: number;
};
```

Guardrails: no new BFS (reuse the cached network); O(towns) to build; cached
and invalidated with the existing town-network cache version; arrays capped
for very large empires (keep top-N towns by `baseGoldPerMinute`, N≈64).
Counts include `under_construction` copies so two ticks don't both propose
the same amplifier.

### 3. Marginal-value scoring

New `apps/simulation/src/ai/build/economic-synergy-scoring.ts` (keeps
`structure-command-planner.ts` under the 500-line limit; extract the
town-support candidate block into it first). Each candidate gets
`score = maxScore × need × clamp01(Δ / reference)`, where Δ is the
estimated gain if built now and `need` is the existing NeedVector deficit
(`GOLD` for coin, `MANPOWER_CEILING` for Depot/Lattice,
`MANPOWER_THROUGHPUT` for Factory/Neural Works). `maxScore` stays inside the
current 20–190 band so these compare fairly with Hydrogarden, forts, etc.

| Candidate | Eligible when | Δ (marginal gain) |
| --- | --- | --- |
| Manufactory at town T | open support tile; Industrial Tooling Module installed | `T.base × T.connectedMult × (CH ? 0.35 : 0.10) + flat` |
| Clearing House in network N | none in N; N has ≥ 2 Manufactories (built or planned this tick) | `Σ_towns base × connectedMult × manufactories × 0.25` |
| Trade Nexus in network N | none in N; `townCount ≥ 2` | `Σ_towns base × manufactoryMult × connectedTownBonus(townCount−1)` |
| Ancillary Depot at T | open support tile | `150 + T.baseManpowerCap × (RL ? 0.35 : 0.10)` |
| Reserve Lattice in N | none in N; N has ≥ 2 Depots | `Σ depots × baseCap × 0.25` |
| Ancillary Factory at T | T has none | `0.05 + (NW ? 0.10 : 0)` per min |
| Neural Works in N | none in N; N has ≥ 2 Factories | `0.10 × factories` per min |

Placement for network singletons: pick the town in N with the most open
support tiles (they don't care which town hosts them), so the best stacking
towns keep their ring space for Manufactories/Depots. Stacking types prefer
the town with the highest `base` — the bonus is multiplicative with it.

Natural build order this produces (no hard-coded script): Manufactory in the
best town → 2nd Manufactory → Trade Nexus once a 2nd town connects →
Clearing House once ≥ 2 Manufactories → keep stacking Manufactories, each now
worth 3.5× more. Same shape for Depot → Reserve Lattice and Factory → Neural
Works.

Keep the `foodLow → INCUBATION_ENGINE` override: a starving town produces no
coin, so food stays first.

### 4. Optional: grow networks on purpose (Phase 5)

The connected-town bonus needs settled corridors between towns. Add a small
EXPAND/SETTLE score bonus for frontier tiles that would join two of the AI's
own town groups when one of them has a Trade Nexus. Only after Phases 1–4 show
a measurable gain; it touches the frontier planner, which is CPU-sensitive.

## Diagnostics

Extend `/admin/debug/ai/decisions` (`ai-decision-diagnostics.ts`) with:

- `economicSynergy`: per network (capped at 8), `{ townCount, manufactories,
  clearingHouse, tradeNexus, depots, factories, neuralWorks, reserveLattice }`.
- On the chosen economic build: `{ type, delta, need, score }`, plus the
  runner-up, so "why did it build X instead of a Clearing House" is answerable
  from production.

Add counters to `/admin/runtime/metrics`: AI networks with a Trade Nexus,
with a Clearing House, mean Manufactories per AI town.

## Phases

0. **Baseline.** Pull production `/admin/debug/ai`, `/admin/debug/ai/decisions`
   and `/admin/players` for every AI: structure counts per town and
   `incomePerMinute`. (Needs `api.borderempires.com` allowed in the agent
   environment's network settings.) Record the numbers in this doc.
1. **Stacking fix** (small, ships alone). Shared stacking module; replace the
   singleton skip with `!structureStacksPerTown(type) && existing.has(type)`.
   Fixes Manufactory, Ancillary Depot and Aether Condenser stacking at once.
2. **Town-economy view** + plumbing into the worker input, with a structural
   complexity test (built once per town, no per-tile network walk).
3. **Coin engine scoring:** Manufactory, Clearing House, Trade Nexus.
4. **Manpower engine scoring:** Ancillary Depot, Reserve Lattice, Ancillary
   Factory, Neural Works. Diagnostics land with 3/4.
5. **Corridor bonus** (optional, see §4).

Each phase is its own PR to `develop`, verified on staging by sampling
`/admin/players` income per AI over a few hours versus the Phase 0 baseline.

## Tests (each fails before its fix)

Colocated in `apps/simulation/src/ai/`:

- Proposes a 2nd Manufactory / 2nd Ancillary Depot at a town that has one.
- Still never proposes a 2nd Ancillary Factory, Trade Nexus or Clearing House
  at the same town (singletons stay singletons).
- Proposes a Clearing House once its network has ≥ 2 Manufactories; not before.
- Never proposes a Trade Nexus in an isolated town or in a network that has one.
- Never proposes Neural Works / Reserve Lattice in a network that has one
  (would be a runtime rejection loop).
- Proposes Neural Works once ≥ 2 Factories share a network; Reserve Lattice
  once ≥ 2 Depots do.
- Prefers the higher-tier town for stacking types.
- Town-economy view: traversal counter proves O(towns), and the capped path
  is exercised for a large empire.
- Scenario test: a seeded 3-town AI empire run for N planner ticks ends with
  a Trade Nexus + Clearing House + ≥ 3 Manufactories and higher income than the
  pre-change planner on the same seed.

## Release notes and lore

- AI opponents will get noticeably richer and field more manpower. That is a
  server behaviour change, so each shipping phase adds a
  `CLIENT_CHANGELOG_ENTRIES` entry ("AI empires now build coordinated
  industry…").
- Lore reviewed; no canon change (AI behaviour only, no change to what any
  structure means).
- No map overlays or highlights, so renderer parity does not apply.

## Open questions

- Should the stronger economy be gated by AI difficulty/personality, or apply
  to every AI?
- Ordering with [`stacking-adjacency-plan.md`](stacking-adjacency-plan.md): if
  adjacency ships first, Phase 1's placement must pick a tile touching an
  existing same-family building.
