# Expansion Motivation — Exploration Brief

> **Status:** Early exploration, NOT a committed design. Handoff brief for an
> agent/designer to continue from. Captures a beta-tester complaint ("I stop
> exploring/expanding once my economy gets going"), grounds each of the
> tester's hypotheses in the actual code, adds relevant external RTS/4X
> research, and lays out candidate design levers with open questions.

---

## 1. The problem (beta tester report, translated from Swedish)

A tester noticed they stop bothering to explore/expand once their economy is
running, and floated five hypotheses:

- **A.** Expansion matters more early; each new tile is a bigger improvement early on.
- **B.** Expansion is *more expensive up front* (relative to what you have), so early decisions feel deliberate — implying late decisions, by contrast, feel thoughtless.
- **C.** Once the economy runs, optimizing/building support structures is more fun than claiming more tiles.
- **D.** No felt need to keep exploring — you already have the resources you need; nothing motivates continued expansion.
- **E.** Expansion itself is repetitive — the same action over and over with nothing new or unexpected.

## 2. Grounding each hypothesis in the live code

| # | Hypothesis | Grounded finding |
|---|---|---|
| A | Bigger gains early | Tile yields are flat by resource type regardless of when claimed (`tile-yield-view.ts:50-66`: FARM 48 FOOD/day, FISH 72, IRON 60, WOOD/FUR 60 SUPPLY, GEMS 36 CRYSTAL). No mechanic scales value up or down with game age — the "feels bigger early" effect is ordinary diminishing marginal utility, not a designed curve. |
| B | Cost is high **relative to what you have** early, trivial later | **Confirmed structurally.** `FRONTIER_CLAIM_COST = 1` gold and `SETTLE_COST = 4` gold are flat forever (`packages/shared/src/config.ts:15,18`) — your 5th tile costs the same as your 500th. Meanwhile gold income scales with town tier/network bonuses. `docs/gold-sinks-and-converters-2026-03.md` independently confirms this: *"Gold is not scarce enough once an empire reaches strong city income... a player at 170 gold/m produces 244,800 gold/day."* Since absolute cost never rises, its weight *relative to income* strictly decays — this is the real mechanism behind "no longer feels like a decision." |
| C | Optimization competes with expansion | **Confirmed and mechanical, not just psychological.** Settling a claimed tile and building/upgrading a structure draw from the *same* `DEVELOPMENT_PROCESS_LIMIT` queue (base 3, `config.ts:32`) via `activeDevelopmentProcessCount` (`player-runtime-summary.ts:274-289`). The tech tree already has four "+1 development slot" doctrines — `frontier-doctrine` (tier 1), `supply-state` (tier 3), `imperial-roads-domain` (tier 4), `imperial-expansion` (tier 5) (`packages/game-domain/data/domain-tree.json`) — so a fully-teched player can reach 7 slots, not 3. **The March gold-sinks doc's "hard cap of 3" framing is stale.** The live contention is real, but partially already mitigated by tech the player may not be prioritizing or may not understand is relevant to this exact tradeoff. |
| D | Already have enough | **Confirmed, several distinct ceilings**: empire strategic-resource storage cap = `income × 12h` (`runtime-empire-storage.ts:14-33`), per-tile yield buffers (`TILE_YIELD_CAP_GOLD=24`, `TILE_YIELD_CAP_RESOURCE=6`), per-town population caps, gold not stored beyond town cap. Converter structures (Fur/Crystal Synthesizer, Ironworks + Advanced tiers) are intentionally weak (~30-40% of a real tile's output per `server-game-constants.ts:119-124`, matching `docs/gold-sinks-and-converters-2026-03.md`'s explicit design rule not to let "rich + safe + tall" beat "controls the map") — but at scale, many converters can still let a rich, landlocked empire approximate sufficiency without new land, just less gold-efficiently. |
| E | Repetitive | **Confirmed.** The claim action is identical every time (pay 1 gold, wait 1.25s, or 4× on forest). Only 238 resource clusters exist (`CLUSTER_COUNT_MIN/MAX = 238`, `config.ts:113-114`), each 4-8 tiles, in a 450×450 = 202,500-tile world — the overwhelming majority of claimable land carries no resource payload at all. No dedicated "where to explore" suggestion system exists; the closest thing, the Domain Progress Card (`client-domain-progress-card.ts:18-23`), only ever prompts about shard caches for doctrine progress, not general expansion. |

**Net finding:** of the five, only A is "not really a problem" (it's just normal
diminishing returns). B, C, D, and E are all real and reinforce each other:
flat cost decays to thoughtlessness (B) → attention shifts to structures,
which *do* have ongoing decisions via the shared queue (C) → several hard
resource/throughput ceilings mean more land often doesn't help right now (D)
→ and the click-for-click sameness of claiming (E) has nothing left to mask
it once the decision-weight from B is gone.

## 3. Relevant existing systems (don't reinvent these)

- **Victory paths already tie to continued territorial control**: `RESOURCE_MONOPOLY` (control ≥80% of one resource type, `SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE = 0.8`, `server-game-constants.ts:246`) and `MARITIME_SUPREMACY` (≥55% of docks) are real, already-implemented reasons to keep claiming land late-game — they're just not surfaced as a live progress readout to the player the way shard/doctrine progress is.
- **Barbarian tiles already escalate**: a barbarian tile gains +2 progress toward multiplying if it holds a resource/town/fort/dock, vs +1 for empty land (`docs/game-mechanics.md` §2, `runtime.ts:5976`) — the system already privileges "juicy" barbarian targets, it's just not called out to the player.
- **Shard rain** (`SHARD_RAIN_SCHEDULE_HOURS = [12, 20]`, 3-6 sites, 30 min TTL) is the closest existing analog to AoE relics / a renewable discovery hook — already a scarce, scheduled, contestable prize.
- **Auto-consolidation** (proposed, not yet built) in `docs/defense-consolidation-exploration.md` §3.2 — "a tile fully surrounded by your own territory becomes core with zero clicks" — was designed to solve a *different* complaint (defensibility gauge feels bad) but directly overlaps with E here: interior filler-tile babysitting is exactly the repetitive part of expansion. Any implementation of auto-consolidation should extend to ordinary frontier claiming, not just settled defense.
- **Season length is 30 days** (`SEASON_LENGTH_DAYS = 30`, `config.ts:116`), and manpower regen is explicitly tuned so "a single settlement fills its cap in ~12 hours" (`config.ts:47-49`) — i.e. the game is already designed to tolerate players who check in roughly twice a day, not continuously. **Any fix should avoid harsh decay/depletion mechanics that punish offline time** (e.g. a Frostpunk-style "resource nodes run dry" model would fight this existing design assumption).

## 4. External research: how other RTS/4X games keep expansion alive late-game

Ranked by how directly each would attack the mid-game plateau (not just early motivation):

1. **Escalating need tiers that outpace old resources (Anno)** — new population/building tiers require resources you structurally can't produce locally.
2. **Terrain/resource-locked exclusive bonuses (Civ wonders/districts)** — best-in-slot buildings gated to specific tile types, so "one more building" isn't enough, you need the right ground.
3. **Depleting resource nodes forcing outward churn (Frostpunk)** — standing still is a loss condition. *(Likely a poor fit here — see season-length note above.)*
4. **Renewable quest/event hooks (Civ city-states, Old World ambitions)** — a continuously-regenerating stream of discrete "go do this" objectives.
5. **Strategic/territorial value independent of yield (AoE chokepoints/vision)**.
6. **Scarce, escalating-value discoverable prizes (AoE relics)** — closest existing analog here is shard rain.
7. **Absorb-a-faction prizes (Humankind)** — Humankind's own community flags this as under-differentiated without enough per-prize variety; a cautionary note if we build something similar around barbarian tiles.
8. **Action-economy scarcity forcing continuous prioritization (Old World Orders)** — closest existing analog here is `DEVELOPMENT_PROCESS_LIMIT`.
9. **Diminishing-but-not-zero returns, tuned deliberately** — currently happens by accident via manpower-regen weight decay and the connected-town-bonus cap (below), not as a legible player-facing curve.

## 5. Candidate ideas by problem, labeled by effort

### B — flat cost decaying to thoughtlessness
- **Tuning:** give `SETTLE` a small manpower cost that scales with settlement tier (currently `EXPAND`/`SETTLE` cost 0 manpower — only `ATTACK` does, per `manpowerRequirements()` in `packages/game-domain/src/index/index.ts:233-242`). Manpower caps scale by tier (150 → 2,400) but regen is weight-discounted per settlement index (`manpowerRegenWeightForSettlementIndex`, `config.ts:62-66`), so tying expansion to manpower keeps it competing against your attack budget throughout the game, unlike gold which every doc confirms outruns every sink.
- **New system:** apply the same incremental/doubling scaling pattern already used for Fort/Siege/Observatory/Airport (`structure-costs.ts:183-188`) to `FRONTIER_CLAIM_COST`/`SETTLE_COST`, at a much gentler rate, so relative cost stays roughly constant instead of decaying toward zero. Needs careful tuning so early expansion isn't punished — the existing military-structure curves are a starting reference, not a direct copy.

### C — optimization competes with expansion for the same queue
- **Tuning (near-free):** the four "+1 dev slot" doctrines already exist (§2 above) — audit whether the client actually explains *why* researching them helps ("lets you settle while building" is not obviously implied by "Frontier Doctrine" as a name) and whether their tech-tree placement lines up with when players start feeling the C symptom.
- **New system:** a dedicated settle-only slot (e.g. a governance structure/tech that adds +1 slot usable only by `SETTLE` processes) so the two loops stop being strictly 1:1 fungible.

### D — resource sufficiency removes motivation
- **Tuning:** build a live victory-path-proximity readout (reusing the Domain Progress Card pattern in `client-domain-progress-card.ts`) for `RESOURCE_MONOPOLY` (80% share) and `MARITIME_SUPREMACY` (55% docks) per resource/type — turns "I have enough" into "I'm N tiles from monopoly," using thresholds that already exist in `server-game-constants.ts`.
- **New system:** extend real demand for an under-leveraged existing resource. `OIL` is a strategic resource type (`docs/game-mechanics.md` §3) currently gated almost entirely behind tier-6 Plastics/Airport — pulling OIL demand into more mid-tier structures would create genuine, continuing need for land without inventing a new resource type from scratch (an Anno-style lever using what already exists).

### E — repetitive expansion action
- **Tuning:** surface which barbarian tiles are "juicy" (resource/town/fort/dock-holding, i.e. the ones already worth +2 progress per `runtime.ts:5976`) in the client, since the system already privileges them mechanically but never tells the player.
- **Tuning:** extend the planned auto-consolidation idea (`docs/defense-consolidation-exploration.md` §3.2) to ordinary frontier claiming, not just settled defense — auto-claim fully-enclosed interior frontier tiles so manual clicks concentrate on the contested edge.
- **New system:** give claimed non-cluster tiles a small chance of a minor "discovery" (bonus gold, temporary buff, small shard trickle) on the shard-rain model, so claiming isn't purely binary "resource cluster or filler."

## 6. Open questions for the next explorer

1. Is a manpower cost on `SETTLE` (B) acceptable given it currently sits at 0 by design (`manpowerRequirements()`), or was that a deliberate choice to keep expansion friction-free relative to combat? Check history/intent before changing.
2. If claim/settle cost scaling is added (B, new-system option), what's the right growth rate so it doesn't reproduce the AI's gold-reserve-starvation bug that `AI_AUTO_CLAIM_GOLD_RESERVE` was added to prevent (`config.ts:20-31`)? The AI auto-claim loop fires every tick unconditionally — any new cost curve must be re-validated against that.
3. Does the client already surface the four development-slot doctrines' relevance to the settle/build tradeoff, or do they read as generic "+1 slot" perks? (`client-tech-html.ts:91` currently renders them as a flat "Development slots +N" line with no framing.)
4. For the OIL-demand idea (D): how rare are OIL tiles in current world gen relative to the other 5 resource kinds? (Not yet checked — `CLUSTER_COUNT` breakdown in `server-worldgen-clusters.ts` should confirm before assuming OIL can bear more demand without becoming a new hard-lockout resource.)
5. For barbarian-tile surfacing (E): would highlighting "juicy" barb tiles make barbarian clearing feel more like directed hunting (good) or just funnel all players onto the same handful of visible targets (bad, contention)? Needs playtesting intuition, not just code-reading.

## 7. Reference map (open these first)

- `packages/shared/src/config.ts` — `FRONTIER_CLAIM_COST`, `SETTLE_COST`, `DEVELOPMENT_PROCESS_LIMIT`, `CLUSTER_COUNT_*`, `SEASON_LENGTH_DAYS`, manpower tables.
- `packages/shared/src/structure-costs/structure-costs.ts` — existing scaling patterns (doubling/incremental) to reuse or reference for B.
- `apps/simulation/src/player-runtime-summary.ts` — `activeDevelopmentProcessCount` (the shared settle/build queue, C).
- `packages/game-domain/data/domain-tree.json` — the four `developmentProcessCapacityAdd` doctrines.
- `packages/game-domain/src/server-game-constants/server-game-constants.ts` — victory path thresholds, converter output constants, shard rain schedule, barbarian progress gain.
- `apps/simulation/src/tile-yield-view/tile-yield-view.ts` — per-tile yield formulas, converter output merge logic.
- `apps/simulation/src/runtime-empire-storage.ts` — empire storage cap (D).
- `packages/client/src/client-domain-progress-card.ts` — existing UI pattern to extend for a victory-path-proximity readout.
- `docs/gold-sinks-and-converters-2026-03.md` — prior art on why gold stops being the limiter and the converter design rules (don't undo these).
- `docs/defense-consolidation-exploration.md` — auto-consolidation idea to extend for E.
- `docs/game-mechanics.md` — canonical mechanics reference; victory paths in §7, GOAP catalog in §10.
