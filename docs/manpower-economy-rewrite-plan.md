# Manpower Economy Rewrite — Full Plan

> **Status:** Design proposal, not yet committed to code. This is the
> consolidated plan from a long design discussion. It supersedes the
> candidate ideas in `docs/expansion-motivation-exploration-brief.md`
> (keep that doc for the grounded problem-diagnosis and the verification
> log; this doc is the actual direction).
>
> **Provenance discipline:** every number below is tagged either
> `[code]` (verified against a specific file:line in this repo) or
> `[proposed]` (a design number that still needs tuning/modelling). Do not
> treat `[proposed]` numbers as final — several are anchors chosen for
> illustration and explicitly need playtest/modelling before shipping.

---

## 1. The problem we are solving

A beta tester reported they stop bothering to explore/expand once the
economy is running, and floated five hypotheses (original Swedish
preserved, since the nuance of B matters):

- **A.** *Expansion är viktigare i början och varje ny tile ger större
  förbättring i början än i mid-game.* — Early tiles feel more impactful
  than mid-game tiles.
- **B.** *Expansion är dyrare i början, så varje beslut kräver mer
  eftertanke.* — Early expansion is costlier **relative to what you have**,
  so each decision demands more thought; by mid-game it doesn't.
- **C.** *När ekonomin kommit igång mid-game så är det roligare att bygga
  och optimera support-byggnader än att klicka ut fler tiles.* — Once the
  economy runs, optimizing buildings is more fun than clicking out tiles.
- **D.** *Du känner inget behov av att utforska mer i mid-game eftersom du
  redan har de resurser du behöver.* — No felt need to expand mid-game;
  you already have the resources you need.
- **E.** *Själva expansionen blir för repetitiv mid-game.* — Expansion
  itself is repetitive; the same action with nothing new or unexpected.

### What this plan fixes, honestly

| Problem | This plan | Mechanism |
|---|---|---|
| **B** | **Directly fixed** | Manpower's regen is structurally throttled (unlike gold's uncapped income), so per-action cost stays weighty relative to available resource at every stage. |
| **C** | **Directly fixed** | *All* buildings cost manpower, drawing from the same finite pool as combat and expansion — permanent guns-vs-butter tension instead of gold funding everything freely. |
| **D** | **Conditionally fixed** | More towns → more manpower cap + regen + more slots = more legible, non-stockpiling capacity to act. Fragile: only holds if the regen taper is not loosened into "infinite manpower." Reinforced by the Empire Integrity fix (§6). |
| **A** | **Not broken; softened** | Always ordinary diminishing marginal utility, not a bug. A mid-game settle still *costs* real manpower, so it doesn't decay into a non-decision the way a 4-gold settle did. |
| **E** | **NOT fixed by the economy rewrite** | Manpower changes *whether* to expand, not the moment-to-moment *feel* of it. E needs the separate Discovery track (§7). Shipping the economy rewrite alone leaves E exactly as broken. |

---

## 2. Core diagnosis — why gold fails and manpower doesn't

Gold's defect was never "gold exists." It is that gold **income scaled up
without a matching brake**: `TOWN_BASE_GOLD_PER_MIN = 2` `[code:
game-mechanics.md §3]` (~2,880 gold/day/town before tier and connected-town
bonuses), while `FRONTIER_CLAIM_COST = 1` and `SETTLE_COST = 4` stayed flat
forever `[code: config.ts:15,18]`. Cost-to-income therefore collapses toward
zero as an empire grows — the mechanical root of B, C, and D. Prior art
already documented this: *"Gold is not scarce enough once an empire reaches
strong city income"* `[docs/gold-sinks-and-converters-2026-03.md]`.

Manpower is different **by construction, already in the codebase**:

- **Cap grows unbounded with town count** — each town adds its tier's cap
  (150→2,400) with no discount `[code: runtime-manpower.ts:15-21]`.
- **Regen is throttled per additional town** —
  `manpowerRegenWeightForSettlementIndex`: full weight for settlements
  0–4, 0.5× for 5–14, 0.2× for 15+ `[code: config.ts:62-66]`,
  applied in `runtime-manpower.ts:23-36`.

So a large empire has a **deep reservoir but a slow refill** — spending
always has a real opportunity cost, at every stage, because refilling stays
comparatively slow *by design*. That brake is the thing gold never had.
This is why the swap is structural, not a relabel.

Today manpower only gates **combat** (ATTACK 60, DEEP_STRIKE /
NAVAL_INFILTRATION 120) and forts (Fort 300, Siege Outpost 60, Wooden
Fort / Light Outpost 30) `[code: config.ts:67-72, structure-costs.ts]`.
EXPAND and SETTLE cost **zero** manpower `[code:
game-domain index manpowerRequirements()]`. The two actions the beta tester
says stop mattering are funded by the one currency that can't stay scarce.
This plan fixes exactly that.

---

## 3. The plan at a glance — four pillars

1. **Manpower economy** (§4): expansion, settlement, and *all* buildings
   cost manpower. Guns-vs-butter becomes the central tension.
2. **Resource slots** (§5): IRON/CRYSTAL/SUPPLY/OIL and FOOD become
   discrete, tile-bound slots instead of stockpiles.
3. **Gold rescope** (§6): gold cut ~250–300×, its remaining jobs are tech,
   rush-buys, and synthesizer upkeep.
4. **Expansion feel + Discovery** (§7): fix Empire Integrity so shape
   matters; add real discovery/variety to attack E.

---

## 4. Pillar 1 — The manpower economy

### 4.1 What moves onto manpower

**Everything that builds or expands.** Expansion, settlement, and every
economic structure (Farmstead, Camp, Mine, Granary, Market, Bank, Foundry,
synthesizers, governance buildings, monuments) now cost manpower as their
primary cost. Fort already works this way — this extends a proven,
already-shipped pattern to the whole build economy rather than inventing a
new mechanic.

### 4.2 Manpower cost anchors `[proposed — needs modelling]`

| Action | Manpower | Rationale |
|---|---|---|
| **Expand** (claim → FRONTIER) | ~10 | Cheapest — just claiming dirt; 0 defense, 0 yield. |
| **Settle** (FRONTIER → SETTLED) | ~20–25 | The growth loop we're reviving; acquisition of new capacity/slots + defense + Integrity `T`. Priced below structures on purpose. |
| Farmstead / Camp / Mine / Granary | ~35 | Basic optimization sinks — amplify a tile you already have; pure spend, no capacity return. |
| Market / synthesizers | ~70 | |
| Bank / Foundry | ~180 | |
| Fort | 300 | `[code]` already set — highest common build. |

**Design rule that sets the ordering:** *acquisition is always a little
cheaper than optimization.* Settle (acquire a producing tile / new slots) <
Farmstead (optimize an existing tile). This tilts the player back toward the
map — expressed in the cost numbers themselves, not a tutorial. (Note: an
earlier version of this reasoning wrongly claimed settling "returns
manpower via a new town" — corrected: SETTLE does **not** create a town
`[code: runtime.ts:2804-2809 preserves but never mints a town]`; it returns
resource *slots*, and towns are a separate concept. The cheap-settle
conclusion survives on the acquisition-vs-optimization principle.)

### 4.3 Starting manpower and the onboarding problem `[proposed — unresolved]`

Two constraints in tension:
- Players **complained when starting gold was lowered** — a stingy opening
  feels bad. Don't recreate that.
- A generous *starting gift* does **not** recreate gold's disease (that was
  an *income-scaling* problem, not a starting-balance one), so being
  generous at the start is safe **as long as ongoing regen-vs-cost stays
  tight** — which the taper already guarantees.

**Do not** copy the old 100-gold : 1/4-cost ratio (100×/25×). Applied to
manpower costs that would be ~750–1,000 starting manpower = 40–50 instant
settles, a real snowball/fairness problem in an async persistent world.
That ratio was itself a symptom of the broken economy.

**Back the number in from feel instead:** decide how many tiles a brand-new
player should comfortably settle in their first sitting, then multiply.
Current lean ~300–500 manpower (≈12–20 settles). **Exact number is an open
question** (§9) — the user pushed back that 1,000 is too much and that the
old lower values felt bad, so this needs a deliberate call, not a ratio.

**The "press around, run out, leave" risk is real and separate.** The
existing regen (`MANPOWER_BASE_REGEN_PER_MINUTE = 150/720 ≈ 0.2/min`,
~12h to fill from empty `[code: config.ts:47-50]`) was tuned for
*combat-only* spending by established empires — it was never designed
against a new player draining the pool in the first 10 minutes just
exploring the UI. Under this rewrite that becomes the default new-player
experience. Candidate fixes (not mutually exclusive):
1. **Faster regen floor for small/new empires** (preferred) — fix the
   underlying assumption; the slow tight curve applies once you have real
   scale and real decisions.
2. **Temporary onboarding regen boost** for a new account's first
   session/day, tapering to the real rate. Keeps endgame numbers untouched.
3. **Faster-when-empty regen curve** — recovery boost near zero, so an
   accidental full drain isn't as punishing as a deliberate one.

### 4.4 Manpower-boosting structure tree `[proposed]`

Moving the economy onto manpower means manpower needs its own investment
ladder (as gold structures had Market/Bank). Partial foundation already
exists — **Rail Depot** grants `RAIL_DEPOT_MANPOWER_REGEN_PER_MIN = 0.5`
empire-wide `[code: config.ts:161]`, part of the mustering system that is
**live in prod and staging** (`MUSTER_SYSTEM_ENABLED = "true"` in both
`fly.combined.toml` and `fly.combined.staging.toml`) `[code]`.

Proposed ladder:
- **Local tier** (new, low): a cheap town-level structure boosting *that
  town's* regen.
- **Mid tier**: repurpose **Garrison Hall** (exists `[code:
  structure-costs.ts:76]`) into a manpower-**cap** booster for its town —
  cap and regen get separate buildings, matching that they're already
  separate stats.
- **Network tier**: **Rail Depot** as-is — empire-wide regen `[code]`.
- **Capstone** (late tech/structure): softens the settlement-index regen
  taper *through investment* — e.g. raise the full-weight threshold from 5
  towns to 10, or lift the 0.2× floor to ~0.35×. Keeps the taper's
  anti-snowball job by default; gives a big invested empire an *earned* way
  past it instead of a permanent wall.

**Bootstrap-trap rule:** these structures cost **gold (rescaled) + a slot**
(IRON or SUPPLY), **not manpower** — building the thing that fixes your
manpower shortage must not itself require the manpower you don't have.

### 4.5 The tension this creates (the point)

Because ATTACK already spends from the same pool, making all builds cost
manpower means expansion, economy, and war permanently compete for one
resource. You can't "solve" your economy and coast — growing it always eats
into what you have to defend or strike with. That is the structural fix for
C, and the real decision-weight B was asking for.

---

## 5. Pillar 2 — Resource slots

### 5.1 The model: permanent allocation, not tap-and-cooldown

IRON/CRYSTAL/SUPPLY/OIL stop being stockpiled quantities. **Each settled
resource tile provides discrete slots.** A structure that needs a resource
**permanently occupies one slot for its lifetime** (we explicitly rejected a
tap-then-cooldown timer model in favour of this — simpler to build, simpler
to show, no timers anywhere). Construction just requires a free slot of the
right type at build time; the slot stays locked to the structure until it's
demolished.

- **Fort**: 300 manpower + **occupies 1 IRON slot** (instead of 45
  stockpiled IRON). Own 3 IRON tiles → 3 Forts, then you're out until you
  free one or claim a 4th IRON tile.
- **Why this beats stockpiles for problem D:** a stockpile caps out ("I have
  enough"). A slot **cannot** — owning your 6th IRON tile is "a 6th
  independent thing I can build/run in parallel, forever," not "a bit more
  income I don't need." This may be an even more direct answer to "what's
  the advantage of more towns" than the manpower cap itself.

### 5.2 Boosting structures increase slot *count* (one rule, all resources)

A boosting structure raises the slot capacity of the tile it sits on,
instead of an abstract yield %:
- **Mine** on an IRON tile: 1 slot → 2 slots (replaces the old
  `STRUCTURE_OUTPUT_MULT` percentage `[code: tile-yield-view.ts:264-272]`).
- **Farmstead** on a FARM tile: increases the FOOD slots that tile provides.

One legible mental model — "this building lets this tile support more" —
across every resource type, instead of five different bonus formulas.

### 5.3 Food as slots too

FOOD joins the slot model on the *demand* side: **a town requires N food
slots to be powered** (produce gold + manpower). This makes concrete the
abstract `supportMax`/`supportCurrent` mechanic that already gates town gold
`[code: game-mechanics.md §3]`. Farmstead raising a FARM tile's food-slot
output is how you feed more towns.

### 5.4 Dormancy on shortfall (captured/under-supplied structures)

If slot demand exceeds supply (lost a tile, or captured more Forts than you
can feed), the affected structure goes **dormant — no bonus, but stays
standing** — reusing the existing "unfed town → income paused, town not
lost" pattern `[code: game-mechanics.md §3]`. Given the 30-day season and
twice-a-day-checkin tuning, destroying a resource-poor capture would be too
harsh; "captured fort is inert until you secure iron" is consistent with the
rest of the game.

- **Which structure goes dark first** when supply < demand: default
  **most-recently-built loses power first** (protects long-standing
  infrastructure, predictable rule). `[proposed — genuine design choice]`

### 5.5 What stays flow-based (does NOT become slots)

- **FOOD upkeep** is continuous (towns consume every tick) — the *demand*
  is slot-shaped (§5.3) but consumption stays flow.
- **GOLD** — wealth, not tile-bound (§6).
- **SHARD** — already event-gated via shard rain `[code: game-mechanics.md
  §9]`, already doing the scarce-not-stockpiled job; leave it.
- **MANPOWER** — a regenerating pool, not a slot.

Net: **four resource grammars** in one game — manpower (regenerating pool),
slots (IRON/CRYSTAL/SUPPLY/OIL/FOOD-demand), flow (FOOD consumption, gold),
event-gated (SHARD) — each doing a job none of the others can substitute.

### 5.6 Implementation scope for slots

- **v1 = global pool per resource**, not per-tile tapping:
  `ironSlotSupply = Σ(1 + mineBonus)` over owned settled IRON tiles;
  `ironSlotDemand = Σ` over iron-consuming structures. AI just checks
  supply ≥ demand; no per-tile assignment needed. Per-tile tapping is a
  nice-to-have for later.
- This **replaces an entire resource-flow subsystem** (production, storage
  caps, converters) for four resource types — the biggest single lift in
  the plan.

---

## 6. Pillar 3 — Gold rescope

### 6.1 Town gold cut ~250–300×

`TOWN_BASE_GOLD_PER_MIN = 2` `[code]` (~2,880/day/town) → **~10 gold/day/
town** `[proposed]`. Starting gold **10** `[proposed]` (down from 100) —
exactly one tier-1 tech, nothing spare, a tight opening beat. Gold's only
remaining jobs: **tech, rush-buys, synthesizer upkeep.**

### 6.2 Tech — no timer, gold-gated, calibrated to town count

Players disliked "pay for a tech then wait for it to research," so **tech
completes instantly on purchase** — no research timer. (Note: verified there
is **no active research-time enforcement in the runtime today** anyway —
`researchTimeSeconds` exists in `tech-tree.json` and is passed through
`tech-domain-bridge.ts` but nothing ticks it down `[code: grep found no
completion/timer logic]`. So "no timer" is also the lower-risk path — we're
not removing a working system, just not building one.)

Rescaled costs, calibrated so a player sustains one tech of a given tier per
day at a given town count (at 10 gold/day/town):

| Tier | Gold cost | Towns for 1/day | `[status]` |
|---|---|---|---|
| 1 | 10 | 1 | `[proposed]` |
| 2 | 50 | 5 | `[proposed]` |
| 3 | 100 | 10 | `[proposed]` |
| 4 | 200 | 20 | `[proposed]` |
| 5 | 400 | 40 | `[proposed]` |
| 6 | 800 | 80 | `[proposed — gut-check]` |
| 7 | 1,600 | 160 | `[proposed — gut-check]` |
| 8 | 3,200 | 320 | `[proposed — gut-check]` |

(5× jump T1→T2, then ×2 per tier.) **Gut-check flag:** 320 towns for T8 may
be effectively "only the season's clear leader gets there" — could be
intended (cf. `RESOURCE_MONOPOLY` needs 80% control) or may want flattening
at the top. **Keep the one-research-at-a-time rule** — don't let gold buy
parallel research (that recreates "wealth substitutes for map control").

**Leave strategic-resource tech costs untouched** `[code: tech-tree.json]`
— tier 5+ techs require SHARD (1–3), which only comes from shard rain, so
tech pace is *already* tied to active exploration. This is a working
"exploration matters late-game" mechanic already in the tree; lean into it,
don't dilute it.

### 6.3 Rush-buy

Pay gold to cover the **manpower shortfall** of an action (not the full
cost — never punish patience). Rate ~**0.5 gold per manpower point**
`[proposed]`, anchored so a full rush of an everyday action ≈ one tier-1
tech:

| Action | Manpower | Full rush from zero |
|---|---|---|
| Settle | 20–25 | ~10–12 gold |
| Farmstead | 35 | ~18 gold |
| Bank | 180 | ~90 gold |
| Fort | 300 | ~150 gold |

Settle/Farmstead ≈ tier-1-tech price → a real "tech vs. rush this build"
choice. Bank/Fort cost several days' income → a deliberate rich-empire
splurge, not spam. (Earlier we considered a *tech-speed* rush-buy — dropped:
with no research timer and gold now genuinely scarce, it's unnecessary
complexity.)

### 6.4 Synthesizers — reconciled with slots, keep gold upkeep

**Why synthesizers are load-bearing, not a minor bridge:** resource clusters
are scarce and uneven — 52 FARM, 52 FUR, 30 GEMS, 52 IRON, 52 FISH `[code:
server-worldgen-clusters.ts:26-32]` across the whole playerbase. Most
players will never own some resource types. Synthesizers are how a tall /
resource-poor player stays in the game — the whole reason they exist.

Reconciliation with the slot model:
- **A synthesizer provides exactly 1 slot of its resource** — so a
  landlocked player *can* build the one Fort/etc. that needs it — but
  **hard-capped at 1, forever**: unlike a real tile + Mine (upgradable to
  2+), a synthesizer can never be upgraded. Tall gets *access*; expansion
  gets *scale*. Preserves the design rule "controls the map beats rich +
  tall" `[docs/gold-sinks-and-converters-2026-03.md]`, translated from flow
  into slot terms.
- **Keep gold upkeep**: ~10 gold/day (Fur/Iron), ~20 gold/day (Crystal)
  `[proposed]`. Deliberately brutal for a 1-town player (10 gold/day income
  = a single Fur/Iron synthesizer eats the whole day's gold, zero left for
  tech — a real choice); affordable for a 5-town tall player. Correct shape
  for "tall is viable but taxed."

---

## 7. Pillar 4 — Expansion feel (D) and Discovery (E)

### 7.1 Expand / Settle / auto-settle mechanics (corrected understanding)

- **EXPAND** → claimed `FRONTIER` tile: **zero defense, zero yield** `[code:
  frontier-combat defenseMultiplierForTile returns 0 for FRONTIER]`. A
  0-defense hole an enemy walks through for free.
- **SETTLE** → `SETTLED`: gains defense, produces (slots), and **counts in
  Integrity `T`** (settled-tile count vs. exposed edges).
- **Auto-settle** fires the SETTLE automatically **only when the claimed
  tile has a town or resource** — the obvious-value case, to save clicks
  `[code: runtime.ts:2855-2864 client autoSettlementQueue]`.
- **Plain filler tiles do NOT auto-settle.** A player can leave one at
  `FRONTIER` (cheap, but a 0-defense gap in the shape) or **manually settle**
  it.

**Why this matters for D:** a filler tile with no resource has no *yield*
reason to settle under slots — but it now has a **defense/shape reason**:
settling closes a 0-defense hole and improves Integrity `T`/`E`. "Should I
settle this boring tile?" stops being a non-decision and becomes "is closing
this gap worth the manpower?" — a live recurring choice even on tiles with
nothing else going for them.

### 7.2 Fix Empire Integrity (already live, currently inert)

**Correction from earlier drafts:** `EMPIRE_INTEGRITY_ENABLED = "true"` in
**both** `fly.combined.toml` (prod) and `fly.combined.staging.toml`
(staging) `[code]` — it is **already live**, not disabled. But it is inert
in practice: `empireIntegrity(T,E)` is a direct alias for
`defensibilityScore(T,E)` `[code: empire-integrity.ts:11, math.ts:45-51]`,
the same global compactness metric already proven to park every
realistically-shaped empire near ~50%
`[docs/defense-consolidation-exploration.md]`. So its 0.85–1.15× economy /
0.9–1.1× growth multipliers `[code: config.ts:190-193, runtime.ts:1062-1068,
1562-1573]` sit near 1.0× for everyone — shipped but doing nothing.

**Fix:** swap the input from the broken global metric to the **local-support
model** already scoped in `defense-consolidation-exploration.md` §3.1 (base
+ per-neighbour settled support + garrison). Then shape/quality of territory
becomes a **live, uncapped multiplier on your whole economy** — a payoff
that never "maxes out" the way per-tile yield does. No flag flip needed;
it's already on. Maps to **C** (building and expanding-well feed the same
number) and **E**-adjacent (*where* you settle matters, so claims stop being
interchangeable).

### 7.3 The Discovery track — the real fix for E `[proposed]`

Manpower does nothing for E. E is a content/variety problem and needs its
own work. Research into what makes RTS/4X exploration *fun* (Civ goodie
huts, AoE3 treasures, Stellaris anomalies/leviathans/precursors, Endless
Legend curiosities, Old World events) points at one principle: **keep
something genuinely unknown at the moment of the click, bounded so the
uncertainty is exciting not anxious.** Concrete, reusing existing plumbing:

- **Wire up `ANCIENT_RUINS`** — it's a defined `ClusterType` `[code:
  types.ts:7]` that is **never placed in worldgen** (only 5 of 6 cluster
  types are generated `[code: server-worldgen-terrain.ts:154-158]`). Someone
  already planned a ruins mechanic. Claiming a ruins tile pops a **bounded
  mystery reward table** (always at least decent, never a dud — Civ goodie
  huts) via the existing shard-rain event/banner plumbing (`PLAYER_MESSAGE`
  / `SHARD_RAIN_EVENT` `[code: game-mechanics.md §12]`).
- **"Right tool" barbarian tiles** — some barb targets reward a specific
  approach (scout-first, a nearby structure, timing the cooldown), turning
  barb-hunting into an AoE3-treasure puzzle instead of generic combat.
- **Hand-authored boss barbarian strongholds** — rare, named, deliberately
  too tough until your empire is strong, each with a **unique one-time
  reward** (a monument material, a title — nameable, not "+X gold"). This is
  explicit mid/late-game exploration content (Stellaris leviathans).
- **Multi-stage mystery chains** — some ruins drop fragments that only pay
  off once several are found, giving exploration late-game purpose
  (Stellaris precursors).
- **Affordability highlight animation** — pulse/glow a tech the instant it
  becomes affordable, in the existing tech panel `[code:
  client-tech-html.ts]`. A small "reward is ready" dopamine beat (Civ/
  Stellaris cue) — also the one concrete UI ask the user made directly.

---

## 8. Problem → solution matrix (recap)

| # | Fixed by | Notes |
|---|---|---|
| A | (not broken) §4.2 | Manpower keeps mid-game settles a real cost, so no non-decision decay. |
| B | §2, §4 | Throttled regen keeps cost-vs-resource weighty at every stage. |
| C | §4.1, §4.5, §7.2 | All builds + expansion + war share one pool; Integrity aligns build & expand. |
| D | §4.2, §5.1, §7.1, §7.2 | Non-stockpiling capacity (manpower cap + slots); filler tiles get a defense reason; uncapped Integrity multiplier. **Fragile — don't loosen the taper carelessly.** |
| E | §7.3 only | Economy rewrite does nothing here; Discovery track is mandatory if E matters. |

---

## 9. Open questions (unresolved — decide before/while building)

1. **Exact starting manpower** — back it in from "how many settles should a
   new player get in their first sitting?" (lean 300–500, not 1,000).
2. **New/small-empire regen curve** — which onboarding fix (§4.3 #1/#2/#3),
   and the actual numbers. The existing 12h-fill was tuned for combat-only
   and will strangle new players as-is.
3. **Does an occupied slot-tile still produce/serve anything else?** With
   permanent allocation, is a tile whose slot funds a Fort still doing
   anything else, or is that slot simply "spent"? Define precisely.
4. **Which structure goes dark first** on slot shortfall (default: most
   recent) — confirm.
5. **Tier 6–8 tech costs** — is 320 towns for T8 intended or should the top
   curve flatten?
6. **Synthesizer asymmetry** — is "can't upgrade past 1 slot" enough, or
   should its 1 slot also cost more upkeep than a real tile's slot?
7. **Fairness / async join** — a generous opening + first-mover advantage in
   a persistent world: does a fast early player grab disproportionate land
   before others join? Is there an existing mitigation, or is one needed?
8. **Regen taper as whole-economy bottleneck** — the 5/15 taper was tuned
   when manpower only gated combat. As the whole economy's throttle it bites
   far harder; model it against realistic mid/late-season town counts before
   trusting the current curve.

---

## 10. Implementation surface & risks

**Cross-cutting rewrite — not a weekend patch.** Touch points:
- **`packages/game-domain`** — frontier command validation
  (`manpowerRequirements()`, `validateFrontierCommand`), structure cost
  definitions (`structure-costs.ts`).
- **`apps/simulation` runtime** — economy tick, passive income, empire
  storage cap (largely removed for slotted resources), population/support,
  the slot supply/demand computation (new), manpower regen curve.
- **AI planner** — `automation-command-planner.ts`,
  `frontier-command-planner.ts`, `structure-command-planner.ts`,
  `tech-domain-bridge.ts` all reason about gold + a `staminaHealthy` gate
  today; all need reworking for manpower-primary costs and slot availability.
  Respect the **AI CPU guardrails** `[docs/game-mechanics.md §13, AGENTS.md]`
  — slot supply/demand and any local-support recompute must stay cheap and
  hook the single mutation chokepoint `replaceTileState()` `[code:
  runtime.ts:1539]`, not the worker tile caches.
- **Client** — every cost display (tech panel, build menus, action
  previews), the affordability animation, slot supply/demand HUD, Integrity
  readout.
- **Data** — `tech-tree.json` gold rescale; structure-cost table rewrite.

**Biggest risks:**
- **Slots replace an entire resource subsystem** (production, storage caps,
  converters) for 4 resource types — the largest lift; stage it behind a
  flag like muster/integrity already are.
- **Regen taper tuning** (open Q8) — get this wrong and either new players
  are strangled or big empires get gold-style infinite manpower (killing D).
- **AI parity** — if the AI can't reason about manpower/slots as well as it
  reasoned about gold, AI empires regress; budget real planner work.

---

## 11. Suggested sequencing

1. **Empire Integrity input fix** (§7.2) — smallest, already-live, unblocks
   the "shape matters" payoff independent of everything else.
2. **Gold rescale + tech rescale + affordability animation** (§6.1–6.3,
   §7.3 last bullet) — data + UI, low structural risk, immediately changes
   the gold-saturation feel.
3. **Manpower on expansion/settlement + starting/regen onboarding** (§4.1–
   4.3) — the core B/C fix; needs the regen modelling first.
4. **Manpower on all buildings + manpower structure tree** (§4.1, §4.4).
5. **Resource slots** (§5) — biggest lift, flag-gated, last.
6. **Discovery track** (§7.3) — parallel workstream, independent of the
   economy; the only thing that fixes E.
