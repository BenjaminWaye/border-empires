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
| **Expand** (claim → FRONTIER) | **10** `[decided]` | Cheapest — just claiming dirt; 0 defense, 0 yield. Deliberately matches the existing `BARBARIAN_RAID_COST = 10` `[code: config.ts]` — one shared mental model, "10 = a cheap frontier poke," across claiming land and raiding a barbarian tile. |
| **Settle** (FRONTIER → SETTLED) | **20** `[decided]` | The growth loop we're reviving; acquisition of new capacity/slots + defense + Integrity `T`. Priced below structures on purpose. |
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

### 4.3 Starting manpower and the onboarding problem `[decided, pending final regen-curve implementation]`

Two constraints in tension, both real:
- Players **complained when starting gold was lowered** — a stingy opening
  feels bad. Don't recreate that.
- A generous *starting gift* does **not** recreate gold's disease (that was
  an *income-scaling* problem, not a starting-balance one), so being
  generous at the start is safe **as long as ongoing regen-vs-cost stays
  tight** — which the taper already guarantees.

**Do not** copy the old 100-gold : 1/4-cost ratio (100×/25×). Applied to
manpower costs that would be ~750–1,000 starting manpower = 40–50 instant
settles, a real snowball/fairness problem in an async persistent world.
That ratio was itself a symptom of the broken economy — rejected.

**The target opening, decided:** a new player should be able to **expand
~40 tiles and settle ~8 of them** before waiting on regen. At the decided
costs (Expand 10, Settle 20): 40×10 + 8×20 = **400 + 160 = 560 manpower.**

**Starting capital tier `[decided]`:** cap **576**, regen **0.4/min**
(implies a 24h fill window, `576 = 0.4 × 1440`, a deliberate departure from
the existing 12h-fill convention). 576 covers the 560 opening with a small
margin.

**Critical implementation trap, already found and must not be
reintroduced:** `MANPOWER_BASE_REGEN_PER_MINUTE` is a `Math.max` **floor**
applied *after* summing per-town regen `[code: runtime-manpower.ts:23-36]`
— the config comment already warns *"Acts as a floor... so it must scale
with the per-tier regen below — otherwise the tier values are masked."*
**Do not implement the 0.4 starting regen by raising this global floor** —
if the floor is 0.4 and a captured SETTLEMENT-tier town only contributes
0.2, the player's *first* captured town adds **nothing** (its 0.2 sits under
the 0.4 floor), breaking the legible "more towns = more manpower" promise
this whole rewrite depends on for problem D.

**Correct implementation:** give the **starting capital its own tier**
(cap 576, regen 0.4/min), separate from the generic `SETTLEMENT` tier
(cap 150, regen 0.2/min, unchanged `[code]`), and **keep the global floor
low** (≤0.2) so it never masks a captured town's contribution. Then:

| State | Regen | Gain |
|---|---|---|
| Starting capital only | 0.4/min | — |
| + 1 captured/founded town (SETTLEMENT tier) | 0.6/min | **+0.2/min, +150 cap** ✓ |
| + 2 towns | 0.8/min | +0.2/min, +150 cap ✓ |
| ... | ... | (taper kicks in at the 6th per `manpowerRegenWeightForSettlementIndex`, unchanged) |

This makes "capture a town → visibly more manpower" true from town #1
onward, which is the whole point.

**The "press around, run out, leave" risk — now resolved by the above,** not
a separate fix needed. With cap 576 / regen 0.4, refilling after the full
560-opening burst to "can afford one more Settle (20)" takes **~50
minutes**, not the ~35 hours the old combat-tuned 0.2/min floor would have
implied. A new player who overspends exploring the UI is looking at "come
back in under an hour," not "the game is dead for a day and a half." The
three candidate mitigations considered and superseded by this fix: a
temporary onboarding boost, a faster-when-empty recovery curve — neither is
needed now that the capital has its own correctly-sized tier.

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

---

## 12. Full structure cost table `[proposed — first pass, needs real balance modelling]`

All current costs verified directly against `packages/shared/src/
structure-costs/structure-costs.ts`. New manpower numbers are derived from
the tier anchors in §4.2, scaled against each structure's *current* gold
cost band (a reasonable first pass, not a modelled balance). Resource costs
convert to slot requirements per §5 (permanent allocation, not consumed
quantities) except where noted. Gold costs are cut to a minimal/nominal
amount or zero everywhere except synthesizers, which keep meaningful gold
**upkeep** (§6.4) — synthesizers are the one structure type gold still gates
on an ongoing basis.

**Note on Fort/Siege data:** two cost sources exist in the codebase for Fort
and Siege Outpost — the generic `STRUCTURE_COST_DEFINITIONS` table and the
dedicated `FORT_TIER_LADDER` / `SIEGE_TIER_LADDER` (the latter is
explicitly commented as *"Single source of truth... Used by the simulation,
game-domain, and the client"*). The table below uses the tier-ladder
numbers as authoritative; the generic table's `WOODEN_FORT`/`SIEGE_OUTPOST`
entries look superseded and worth deleting during implementation rather
than carrying two sources of truth forward.

### Starter military (already manpower-primary today — keep the pattern)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Wooden Fort | 300g + 150mp + 15 iron, ×1.1/build (incremental) | **150** (unchanged) | 1 IRON slot |
| Light Outpost | 75g + 30mp, ×1.1/build | **30** (unchanged) | — |

### Tier 1 — basic economic sinks (35 manpower)

| Structure | Old cost | New manpower |
|---|---|---|
| Farmstead | 700g + 20 food | **35** |
| Waterworks | 600g + 20 food | **35** |
| Camp | 800g + 30 supply | **35** |
| Mine | 800g + 30 iron (or crystal) | **35** |
| Granary | 700g + 40 food | **35** |
| Observatory | 800g + 45 crystal, ×2/build (doubling) | **35**, doubling scaling kept |
| Census Hall | 900g + 30 food | **35** |

*(Farmstead/Mine/Observatory boost the slot count of the tile they sit on
per §5.2 — they don't themselves consume a slot; requiring a slot to build
the thing that creates slots would be circular.)*

### Tier 1.5 — mid sinks (50 manpower)

| Structure | Old cost | New manpower |
|---|---|---|
| Seed Granary | 1,400g + 80 food | **50** |
| Customs House | 1,800g + 60 crystal | **50** |

### Tier 2 — trade & production infrastructure (70 manpower)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Market | 2,200g | **70** | — |
| Fur Synthesizer | 2,200g | **70** | 1 SUPPLY slot (hard-capped, never upgradeable — §6.4) + **10 gold/day upkeep** |
| Ironworks | 2,400g | **70** | 1 IRON slot (hard-capped) + **10 gold/day upkeep** |
| Crystal Synthesizer | 2,800g | **70** | 1 CRYSTAL slot (hard-capped) + **20 gold/day upkeep** |
| Garrison Hall | 2,200g + 80 crystal | **70** | Repurposed (§4.4) — manpower-**cap** booster for its town |
| Governor's Office | 2,600g | **70** | — |
| Caravanary | 2,600g | **70** | — |
| Airport | 3,000g + 80 crystal, ×2/build | **70**, doubling scaling kept | — |
| Clearing House | 3,000g + 80 crystal | **70** | — |

### Tier 3 — major economic engines (180 manpower)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Bank | 3,200g | **180** | — |
| Foundry | 4,500g | **180** | — |
| Rail Depot | 4,000g + 100 crystal | **180** | Manpower-regen network booster (§4.4), already live |
| Radar System | 4,000g + 120 crystal | **180** | — |
| Advanced Fur Synthesizer | 4,000g + 40 supply | **180** | Still 1 SUPPLY slot (hard-capped), higher output within it + ~15 gold/day upkeep |
| Advanced Ironworks | 4,200g + 40 iron | **180** | Still 1 IRON slot + ~15 gold/day upkeep |
| Advanced Crystal Synthesizer | 4,800g + 40 crystal | **180** | Still 1 CRYSTAL slot + ~25 gold/day upkeep |

### Tier 4 — elite structures (250 manpower)

| Structure | Old cost | New manpower |
|---|---|---|
| Exchange House | 5,000g + 120 crystal | **250** |
| Aether Tower | 6,000g + 160 crystal, ×1.15/build (incremental) | **250**, scaling kept |

### Fort ladder (manpower unchanged — current design is already flat 300; slots are the new differentiator)

| Variant | Old cost | New manpower | New slot requirement | Defense mult |
|---|---|---|---|---|
| Fort | 900g + 300mp + 45 iron, ×1.1/build | **300** (unchanged) | 1 IRON slot | 2.5× |
| Iron Bastion | 1,800g + 300mp + 90 iron | **300** (unchanged) | 2 IRON slots | 4× |
| Thunder Bastion | 4,200g + 300mp + 180 iron | **300** (unchanged) | 4 IRON slots | 8× |

### Siege ladder (manpower unchanged — flat 60 today)

| Variant | Old cost | New manpower | New slot requirement | Attack mult |
|---|---|---|---|---|
| Siege Outpost | 900g + 60mp + 45 supply | **60** (unchanged) | 1 SUPPLY slot | 1.6× |
| Siege Tower | 1,800g + 60mp + 90 supply + 60 iron | **60** (unchanged) | 2 SUPPLY + 1 IRON slots | 1.8× |
| Dread Tower | 4,200g + 60mp + 140 supply + 120 iron | **60** (unchanged) | 3 SUPPLY + 2 IRON slots | 2.0× |

### Monuments — capstone (4 parts + 1 assembly each)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Imperial Exchange / World Engine / Aegis Dome / Astral Dock **Part** (×4 per monument) | 8,000g + 180 crystal each | **400 each** | 1 CRYSTAL slot each |
| Imperial Exchange / World Engine / Aegis Dome / Astral Dock (final assembly) | 18,000g + 2 shard | **600** | 2 SHARD (unchanged — stays event-gated, §5.5) |

A complete monument: 4×400 (parts) + 600 (assembly) = **2,200 manpower**
total, appropriately the single largest investment in the game.

---

## 13. Full tech list & pricing `[gold costs decided per-tier in §6.2; resource/time costs unchanged]`

Full tech list confirmed directly from `packages/game-domain/data/
tech-tree.json` (49 techs across 8 tiers). **Gold cost is flat per tier**
(§6.2) — every tech in a tier costs the same gold, decided already. Each
tech individually also keeps its existing strategic-resource cost
(food/iron/crystal/supply/shard amounts) and its `researchTimeSeconds`
value unchanged in the data, even though neither is currently enforced by
research completing instantly (§6.2) — the resource costs still gate
affordability, they just aren't paired with a wait.

| Tier | Gold (flat, all techs this tier) | Techs |
|---|---|---|
| 1 | **10** | Agriculture, Workshop Standards, Merchant Charters, Cartography, Warbands |
| 2 | **50** | Boiler Alchemy, Field Rigging, Stoneworks, Deep Prospecting, Irrigation, Assembly Guilds, Signal Fires, Aether Moorings |
| 3 | **100** | Brass Drillwork, Ceramic Stores, Royal Mint, Crystal Lattices, Mercantile Ledgers, Survey Corps, Bastion Walls, Siege Towers, Convoy Logistics |
| 4 | **200** | Aether Bridge, Census Records, Dockworks, Beacon Towers, Overload Protocols, Quartermaster Corps, Deep Extraction, Seedline Granaries |
| 5 | **400** | Cipher Bureaus, Aether Engineering, Banking, Provincial Ministries, Rail Networks, Grand Synthesis, Starforged Steel |
| 6 | **800** `[gut-check — see §9 Q5]` | Grand Cartography, Monument Cities, Standing Army, Sky Docks, Resonance Grid, Aether Towers |
| 7 | **1,600** `[gut-check]` | Imperial Exchange, Aegis Dome, Worldbreaker Cannon, Astral Dock |
| 8 | **3,200** `[gut-check]` | Exchange Levy Writs, Worldbreaker Ignition |

Reminder from §6.2: at 10 gold/day/town, this means 1 town sustains a
tier-1 tech per day, 5 towns a tier-2 tech per day, 10 towns a tier-3 tech
per day, 20 towns a tier-4, 40 towns a tier-5 — and per the §9 Q5 gut-check,
tiers 6–8 (80/160/320 towns for 1/day pace) may be intentionally
"season-leader only," matching how `RESOURCE_MONOPOLY` already requires 80%
resource-type control as an endgame-only victory path. Confirm before
shipping rather than assuming.

---

## 14. UI, UX, and copy changes required

This redesign moves manpower from a niche military stat to the game's
primary resource, and correspondingly shrinks gold from "the currency for
everything" to a narrow, specific role. Every surface that currently
foregrounds gold or hides manpower needs to flip. Grouped by what's
confirmed to exist in the code vs. what needs locating during
implementation.

### 14.1 Confirmed existing surfaces that need changes

- **Manpower breakdown panel** — `playerManpowerBreakdownFromSummary()`
  `[code: runtime-manpower.ts:56-102]` already builds a UI-ready breakdown
  (cap/regen line items by town tier, with scaling notes like *"50%
  scaling"* for taper-affected towns). Today this almost certainly renders
  as a secondary/buried stat (manpower only mattered for combat). **It
  needs promotion to a primary, always-visible HUD element** — this is now
  the resource every action check happens against, not an occasional combat
  stat.
- **Tech panel** (`client-tech-html.ts`, `client-tech-panel-flow.ts`) —
  currently renders `developmentProcessCapacityAdd` as a flat *"Development
  slots +N"* line (`client-tech-html.ts:91`) with no framing. Needs copy
  explaining *why* it matters (unblocks settling while building — §4.4).
  Also needs the **affordability highlight animation** (glow/pulse the
  instant a tech crosses from unaffordable to affordable — the "reward is
  ready" cue from the Discovery research, §7.3).
- **Defensibility readout** (`client-tech-panel-flow.ts:46`) — currently a
  single global percentage that `docs/defense-consolidation-exploration.md`
  already proved parks near ~50% for any realistic empire, reading as
  *"you are always average"* — demoralizing and non-actionable. Once the
  Empire Integrity input is fixed to the local-support model (§7.2), this
  needs new copy entirely: local, actionable cues ("3 tiles are
  undefended," "this pocket is cut off") rather than one global number.
- **Domain Progress Card** (`client-domain-progress-card.ts:18-23`) —
  currently only ever prompts about shard caches for doctrine progress.
  Needs expansion if the Discovery track ships (§7.3) — Ancient Ruins hints,
  boss-barbarian sightings, victory-path proximity.
- **Frontier command rejection copy** — `handleSettleCommand` rejects with
  the literal code/message `"INSUFFICIENT_GOLD"` / `"insufficient gold to
  settle"` `[code: runtime.ts:2844]`, and `validateFrontierCommand` gates
  EXPAND/ATTACK the same way (`packages/game-domain/src/index/index.ts:301`,
  checking `input.actor.points`). **Every one of these becomes
  `INSUFFICIENT_MANPOWER`** with matching copy, across every command that
  used to check gold and now checks manpower (which, after this rewrite, is
  nearly all of them).

### 14.2 New UI needed (no existing surface to extend)

- **Slot availability display** — per resource type (IRON/CRYSTAL/SUPPLY/
  OIL/FOOD), show "N/M slots used." Needs a clear visual distinction between
  *"all your slots are full"* (you have iron tiles, they're all committed)
  and *"you have zero slots of this type"* (you don't own the resource at
  all) — different problems, different player actions to fix them.
- **Dormant/unpowered structure indicator** — a structure that's lost its
  slot allocation (captured Fort with no Iron access, per §5.4) needs a
  distinct greyed-out/"unpowered" visual state, plus copy explaining what's
  missing and what to do ("needs 1 Iron slot — settle or capture an Iron
  tile").
- **Rush-buy prompt** (§6.3) — a "rush with gold" option on any
  manpower-blocked action, showing the gold cost to cover just the
  shortfall. Only ever surfaced when there *is* a shortfall — never shown
  as a default option when the player can already afford the action
  normally, to avoid habituating players into treating gold as the primary
  currency again.
- **Synthesizer tooltip copy** — needs to explicitly state the upkeep
  (gold/day) and the hard 1-slot cap with no upgrade path, so players
  understand up front why a Crystal Synthesizer behaves differently from a
  Mine on a real Crystal tile (§6.4) — this is the thing that keeps tall
  play viable, so it needs to read as a deliberate, understood trade-off,
  not a mysteriously weak building.
- **"Juicy" barbarian tile marker** (§7.3) — barbarian tiles holding a
  resource/town/fort/dock already progress toward multiplying twice as fast
  as empty ones (`+2` vs `+1`, `runtime.ts:5976`), but nothing currently
  tells the player which barb tiles are which. A simple marker turns this
  into directed hunting instead of a mechanic only the simulation knows
  about.
- **Ancient Ruins claim event** (§7.3) — if wired up, needs its own reward
  popup/banner, reusing the shard-rain `PLAYER_MESSAGE` /
  `SHARD_RAIN_EVENT` pattern (`docs/game-mechanics.md` §12) rather than a
  new notification system.

### 14.3 Needs locating during implementation (not yet found in this research)

- **Structure build menu / action preview** — every place a player sees a
  cost before committing (build menu, settle confirmation, expand
  confirmation) needs the primary cost line flipped from gold to manpower,
  with resource-slot requirements shown as a secondary badge. Exact
  client file(s) not yet located in this research pass.
- **First-session / tutorial / onboarding copy** — wherever new-player
  guidance currently lives needs to teach the new mental model directly:
  manpower funds everything physical (expand/settle/build/attack), gold
  funds tech only, resource tiles are slots not stockpiles, and an
  unsettled claim has zero defense. Not yet located — flag for whoever
  picks this up to find the actual onboarding surface before writing copy.
- **AI-facing explain/diagnostic strings** — the AI planner's rejection
  reasons and diagnostics (used in `AI_DEBUGGING.md`-style tooling) that
  currently reference gold checks need the same rename for anyone
  debugging AI behavior post-rewrite.
