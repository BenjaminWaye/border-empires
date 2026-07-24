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

### 4.4 Manpower-boosting structure tree `[decided]`

Moving the economy onto manpower means manpower needs its own investment
ladder (as gold structures had Market/Bank). Partial foundation already
exists — **Rail Depot already does two distinct things today**, part of
the mustering system that is **live in prod and staging**
(`MUSTER_SYSTEM_ENABLED = "true"` in both `fly.combined.toml` and
`fly.combined.staging.toml`) `[code]`:
1. **Global manpower regen**: `RAIL_DEPOT_MANPOWER_REGEN_PER_MIN = 0.5`
   per depot, empire-wide, stacking with multiple depots
   `[code: config.ts:161]`. **This is removed** — see the network redesign
   below, which replaces it.
2. **Muster speed boost**: within a 50-tile radius (`RAIL_DEPOT_MUSTER_
   RADIUS = 50`, Chebyshev distance), a Rail Depot boosts any of your
   outposts' manpower-muster inflow rate from the ordinary 1.25×
   (`MUSTER_DEPOT_SPEED_MULT`, the base bonus just for being inside an
   outpost's own 5-tile depot zone) up to 2.0× (`RAIL_DEPOT_BOOSTED_
   MUSTER_MULT`) `[code: config.ts:162-167]` — troops build up at a
   forward position 60% faster near a depot. **Kept unchanged** — this is a
   purely spatial effect (radius-based), independent of the connected-town
   network the redesign below uses, and directly supports the
   burst-and-recovery campaign framing (§9, regen magnitude): mustering
   *is* the "stockpile manpower at a forward point, then commit it in one
   push" mechanic that framing depends on.

Ladder:
- **Local tier** (new, low): a cheap town-level structure boosting *that
  town's* regen.
- **Mid tier — Garrison Hall** (exists `[code: structure-costs.ts:76]`):
  gives **+150 manpower cap, flat, to the town it's built in**, always,
  unconditionally `[decided]` — deliberately matching the base SETTLEMENT
  tier's own cap exactly, so the intuitive read is "a Garrison Hall gives
  this town an extra Settlement's worth of capacity."
- **Network tier — Rail Depot, redesigned** `[decided]`: Rail Depot no
  longer grants its own flat regen. Instead, **Rail Depot is the enabler of
  a network-wide manpower bonus**, reusing the existing connected-town
  network already used for the gold bonus (`economy-network.ts`):
  - **Only one Rail Depot may be built per connected-town network** — a
    second one inside the same contiguous cluster is disallowed. One hub
    activates the whole network; there's no benefit to building more.
  - For **every Garrison Hall in that network, uncapped in count**, Rail
    Depot grants **+0.1 global manpower regen and +75 global manpower
    cap**, on top of that Garrison Hall's own unconditional +150 local cap.
    Both bonuses are attributed to the depot, not generated by the halls
    independently — build one Rail Depot, then every Garrison Hall you
    connect to that network keeps adding to the total, with no ceiling on
    how many can contribute.
  - This is deliberately uncapped on the Garrison Hall side (unlike the
    3-connection cap on the existing gold-network bonus) — the cap already
    lives on the Rail Depot side (build 1, that's it), so gating the
    Garrison Hall side too would double-restrict the same thing. It also
    reinforces the same "stay connected and contiguous" theme that already
    matters for the gold-network bonus and Empire Integrity — a third
    system now rewards maintaining a large, connected empire, and "how many
    towns can I keep genuinely connected" becomes a real, compounding
    manpower question, not just a defensive one.
- **Capstone** (late tech/structure): softens the settlement-index regen
  taper *through investment* — e.g. raise the full-weight threshold from 5
  towns to 10, or lift the 0.2× floor to ~0.35×. Keeps the taper's
  anti-snowball job by default; gives a big invested empire an *earned* way
  past it instead of a permanent wall.

**Correction to an earlier draft of this section**: it previously claimed
these structures cost "gold + a slot, not manpower" to avoid a bootstrap
trap (needing manpower to fix a manpower shortage). That's stale — it
predates the later, load-bearing decision that *all* buildings cost
manpower (§4.1), and the actual costs already locked in §12 confirm this:
Garrison Hall is 70 manpower + 1 FOOD slot + 1 CRYSTAL slot, Rail Depot is
180 manpower + 1 FOOD slot + 1 CRYSTAL slot, same as every other structure
in that tier. The bootstrap concern turns out not to be a real trap in
practice: manpower regenerates passively regardless of what a player
builds, so a drained player always eventually accumulates enough to build
their way out — it just takes time, which is the intended shape of the
whole system (§4.5), not a special case these two structures need an
exception for.

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

### 5.3 Food as slots too — and the universal building upkeep `[decided]`

FOOD joins the slot model on the *demand* side: **a town requires ~2 food
slots to be powered** (produce gold + manpower). This makes concrete the
abstract `supportMax`/`supportCurrent` mechanic that already gates town gold
`[code: game-mechanics.md §3]`.

**Every building requires 1 FOOD slot as ongoing upkeep, unless it already
has a different slot requirement.** Structures with a natural material tie
(Fort family → iron, Siege family → iron/supply, Synthesizers → their own
resource, Observatory/Airport/certain elite structures → crystal, per
§12/§17) keep that resource instead of food. Everything else in the
structure list — Market, Bank, Governor's Office, Caravanary, Foundry,
Census Hall, Rail Depot, Radar System, Exchange House, Aether Tower, Seed
Granary, Clearing House, and Farmstead/Waterworks/Camp/Mine/Granary
themselves — draws 1 FOOD slot each.

**Why this is affordable despite there being only ~300 food tiles on the
map against up to ~2,700 potential building slots (300 towns × 9
slots/town):** food-slot *supply* isn't fixed at 1-per-tile. It scales with
investment:
- **Farmstead adds +1 food slot** to the FARM tile it's built on (base 1
  → 2).
- **Waterworks** (a radius-support structure, not tied to a resource tile
  itself — it boosts nearby Farmsteads rather than producing food, per the
  existing code comment at `tile-yield-view.ts:169-171`) **adds +2 food
  slots to every Farmstead within its radius.** Waterworks is now the
  bigger multiplier of the pair — a Farmstead alone gets a modest bump, but
  a Farmstead *within Waterworks range* jumps from 2 to 4 slots, making
  Waterworks placement (and its radius) the real capacity-scaling decision
  rather than Farmstead spam.

**FISH tiles get a different, fixed treatment: 2 base food slots, with no
Farmstead or Waterworks bonus available** `[decided]`. This preserves the
existing asymmetry already in the code — Farmstead explicitly excludes
FISH (`tile-yield-view.ts:84`: *"Farmstead: +50% food only on FARM tiles.
FISH gets nothing"*), and FISH's old raw yield (72/day) was already ~1.5×
FARM's (48/day) with zero scaling either way. Carrying that forward: FARM
starts at 1 slot but scales to 2 (Farmstead) or 4 (Waterworks-boosted
Farmstead); FISH is a flat, reliable 2 slots forever, no investment
possible. That gives the two tile types a real strategic difference — FISH
is the no-effort, immediately-useful source; FARM is the one worth
developing if you want real scale.

So a heavily-developed FARM tile can support far more than 1 building's
worth of food upkeep — food becomes a resource you actively **build
capacity into** (via Farmstead/Waterworks) rather than a fixed ceiling,
which turns "do I have enough food slots to support my next building" into
a real, ongoing decision rather than a hard wall. Exact multipliers above
are a first-pass anchor, not modelled against the full 2,700-slot
worst case — needs real load-testing once town-count and typical
build-out assumptions are firmer.

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
- **New edge case, now much more consequential given the global
  one-per-season monument cap (§16): what happens when the world's only
  Imperial Exchange (etc.) goes dormant** because its owner lost crystal
  access? Existing infrastructure already supports this cleanly — Imperial
  Exchange Levy already gates on `isStructurePowered` before it can be
  activated (`runtime-map-command-handlers.ts:321`), so "dormant from a
  lost crystal slot" is just one more path into a check that already
  exists — no new logic needed for the ability itself. But there's a real
  risk worth deciding rather than defaulting into silently: since only one
  of each monument can ever exist per season, **a careless or beaten-down
  owner could sit on a permanently-dormant, unrecoverable monument and deny
  it to every other player for the rest of the season**, with no way for
  anyone else to ever build a working one. Whether that's acceptable
  (part of the stakes of winning the race) or needs a release valve (e.g.
  a monument dormant for N consecutive days becomes capturable/vulnerable
  even if the tile itself wasn't lost) is an open question, not decided
  here.

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

**Leave SHARD tech costs untouched, drop every other strategic-resource
cost** (full reasoning and the food/iron/crystal/supply fix in §13) — tier
5+ techs require SHARD (1–3), which only comes from shard rain, so tech
pace is *already* tied to active exploration. That's a working "exploration
matters late-game" mechanic already in the tree; lean into it, don't dilute
it. FOOD/IRON/CRYSTAL/SUPPLY costs on tech, by contrast, can't survive the
slots pillar and are dropped entirely, not left in place.

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
- **Keep gold upkeep**: **30 gold/day (Fur/Iron), 40 gold/day (Crystal)**
  `[decided]`. Superseded an earlier, badly-wrong guess of ~3–4/day.

**How that number was actually derived, since it's worth recording:** the
live game's real upkeep, confirmed against in-game screenshots (not the
code alone, see below), is 12 gold/m for Fur/Ironworks and 16 gold/m for
Crystal Synthesizer (displayed in-game as **"Aether Condenser"** — same
structure, different player-facing name than the internal type; worth
knowing so nobody goes looking for "Crystal Synthesizer" in the UI) —
17,280 gold/day and 23,040 gold/day respectively in the current economy.
Rescaling those by the same ~288× factor used everywhere else gives ~60/80
gold/day; halved (to avoid pricing a synthesizer out of reach for anything
smaller than a 6-town empire, which would undercut the "tall play stays
viable" goal this whole section exists for) gives the final **30/40**.

**A real discrepancy was caught and is worth flagging as its own item,
separate from the number above:** the live code's `player-upkeep-
incremental.ts` computes Fur/Ironworks upkeep as `GOLD_UPKEEP / 10` = 6
gold/m, and Crystal as 8 gold/m — both exactly half the confirmed live
values (12 and 16). Checked `isConverterStructureType`'s only other use
(gating the on/off toggle command) and found no multiplier that would
explain the gap. **Root cause not found** — the live code and the live
displayed number disagree by a clean 2×, and rather than keep debugging
legacy code that's being fully replaced by this rewrite, the live *observed*
numbers were trusted over the code. Also confirmed in the same pass: this
bug is specific to converters — Farmstead's upkeep (0.1 gold/m, live)
matches its code (`FARMSTEAD_GOLD_UPKEEP=1, /10=0.1`) exactly, so the base
pattern isn't broken everywhere, just for Fur/Iron/Crystal Synthesizer.

**Separately confirmed as a real, pre-existing bug worth fixing regardless
of this rewrite**: `ADVANCED_FUR_SYNTHESIZER` reuses `CAMP_GOLD_UPKEEP`
(1.2, i.e. ~17 gold/day) instead of its own rate — `ADVANCED_IRONWORKS` and
`ADVANCED_CRYSTAL_SYNTHESIZER` both correctly reuse their own base
structure's upkeep unchanged. This reads as a copy-paste error (an upgraded
building costing *less* upkeep than the thing it upgrades) and should be
fixed independent of anything else in this plan.

**Implementation rule for the new system, to prevent this exact class of
bug from recurring: use one named global constant for the upkeep interval,
and one shared conversion function, rather than each structure type
re-deriving "divide by 10" inline in a switch statement.** The scattered
`CONSTANT / 10` pattern repeated per-case in `player-upkeep-incremental.ts`
is precisely what let converters silently drift out of sync with
everything else without being caught until checked against a live
screenshot. Express every structure's upkeep directly in gold/day in the
data, convert through a single canonical function, and this stops being
possible.

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

## 9. Open questions

**Resolved:**
- ~~Exact starting manpower~~ → **decided**: capital tier cap 576, regen
  0.4/min, sized to a 40-expand/8-settle opening (§4.3).
- ~~New/small-empire regen curve~~ → **decided**: give the starting capital
  its own tier rather than raising the global regen floor, which would
  mask a captured town's contribution (§4.3).
- ~~Which structure goes dark first on slot shortfall~~ → **decided**:
  most-recently-built loses power first (§5.4).
- ~~Does an occupied slot-tile still produce/serve anything else~~ →
  **decided**: no — it stays spent until the structure using it is removed
  or destroyed (§5.4).
- ~~Tier 6–8 tech costs~~ → **decided, flattened twice**: first pass (60/90/
  120 towns) was still rejected as "basically already won the game" once
  checked against `TOWN_CONTROL`'s 50%-of-towns victory threshold (~150
  towns of ~300). Final curve keeps tier 8 well clear of that line — see
  §13 for the locked table (50/65/80 towns for tiers 6/7/8).
- ~~Synthesizer asymmetry~~ → **decided**: gold upkeep corrected from a
  miscalculated ~3–4/day to **30 gold/day (Fur/Iron), 40 gold/day
  (Crystal)** — half of the strictly-rescaled live numbers, landing between
  "too cheap to matter" and "unaffordable below a 6-town empire." See §6.4
  for the full derivation and the live-game verification that caught the
  original error.
- ~~Fairness / async join~~ → **decided, no new mechanism**: covered by
  existing systems (other players can and will target a fast-snowballing
  early leader; the regen taper already discounts further growth past 5/15
  towns; Empire Integrity rewards shape over raw size). No additional
  mitigation added.
- ~~Monument race consolation~~ → **decided**: the losing racer gets their
  invested manpower refunded if a rival completes the same monument first
  (§16). Raised alongside this: the monument-part cost itself (400
  manpower) was under-priced relative to its "single largest investment in
  the game" billing — see §16 for the corrected figures.
- ~~Monument-dormancy hostage risk~~ → **decided, no release valve**:
  another player can simply take the dormant monument's tile by force.
  That's an accepted risk of racing for a season-unique prize, not a gap.
- ~~Structure build menu location~~ → **partially resolved**: identified as
  `client-building-placement.ts`, dispatched via `client-action-flow.ts` and
  `client-development-queue.ts` — confirmed these are the right area, but
  the exact cost-display line within them wasn't pinned down; verify before
  writing copy (§14.3).

- ~~Regen magnitude~~ → **decided, framing resolved**: modelling this
  properly (§4.3/§10) surfaced that the answer depends entirely on whether
  war is meant to be a sustained drip or a build-up-then-commit rhythm.
  Settled on the latter — **manpower already works everywhere else in this
  plan as a deep reservoir with a slow refill, and combat fits that same
  shape rather than needing its own faster-draining exception.** Concretely:
  the existing regen-per-tier formula is kept as-is, framed explicitly as
  funding **one real campaign (~15-20 attacks, ~1,000-1,200 manpower)
  roughly once every 12-24 hours** for a reference 10-town empire, not
  constant sustained skirmishing. No numeric change to the regen curve —
  only the framing changed, which is a much cheaper thing to revisit later
  if actual play says otherwise than re-deriving the whole curve now.

**No items remain in the "still genuinely open" list** — the structure
build-menu file location (above) is the only partially-resolved item, and
it only needs verification during implementation, not a design decision.

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

### 12.1 A gap in the first pass — ongoing (not just build) crystal upkeep

The original version of this table only converted **build** costs to slots
and missed that some structures also have a separate, **ongoing per-minute
crystal upkeep** on top of their build cost — confirmed directly:
`OBSERVATORY_UPKEEP_PER_MIN = 0.025` and
`AIRPORT_CRYSTAL_UPKEEP_PER_MIN = 0.025` `[code: server-game-constants.ts:
125, config.ts:87]`, both drained continuously while the structure is
active (`player-upkeep-incremental.ts:127,157`). Under slots, this doesn't
need a separate mechanic: **the slot occupation itself is the upkeep** —
once a structure permanently occupies a CRYSTAL slot for as long as it
exists (§5.1, the same rule as Fort/IRON), there is nothing left to meter
per-minute. Observatory and Airport are updated in the tables above to
"1 CRYSTAL slot, permanently occupied while active," replacing their old
build-cost-plus-drain pattern entirely. The same fix applies to the
`reveal_empire` ability's ongoing upkeep (§17).

### Starter military (already manpower-primary today — keep the pattern)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Wooden Fort | 300g + 150mp + 15 iron, ×1.1/build (incremental) | **150** (unchanged) | 1 IRON slot |
| Light Outpost | 75g + 30mp, ×1.1/build | **30** (unchanged) | 1 FOOD slot |

### Tier 1 — basic economic sinks (35 manpower)

**Universal rule (§5.3): every building draws 1 FOOD slot as ongoing
upkeep unless it already has a different slot requirement.** Applied
below.

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Farmstead | 700g + 20 food | **35** | 1 FOOD slot (upkeep) — *also boosts the tile's own FOOD slot count by +1, per §5.2/5.3* |
| Waterworks | 600g + 20 food | **35** | 1 FOOD slot (upkeep) — *also boosts every Farmstead within its radius by +2 FOOD slots, per §5.3* |
| Camp | 800g + 30 supply | **35** | 1 FOOD slot |
| Mine | 800g + 30 iron (or crystal) | **35** | 1 FOOD slot (upkeep) — *also boosts the tile's own IRON/CRYSTAL slot count, per §5.2* |
| Granary | 700g + 40 food | **35** | 1 FOOD slot |
| Observatory | 800g + 45 crystal build + 0.025 crystal/min ongoing upkeep, ×2/build (doubling) | **35**, doubling scaling kept | **1 CRYSTAL slot** (already has "another slot requirement," so no food slot) — see §12.1 note. |
| Census Hall | 900g + 30 food | **35** | 1 FOOD slot |

*(Farmstead/Waterworks/Mine still boost the slot count of the tile/radius
they affect, per §5.2/5.3, in addition to drawing their own 1 FOOD slot of
upkeep — the boosting effect and the upkeep cost are separate things.)*

### Tier 1.5 — mid sinks (50 manpower)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Seed Granary | 1,400g + 80 food | **50** | 1 FOOD slot |
| Customs House | 1,800g + 60 crystal | **50** | 1 FOOD slot |

### Tier 2 — trade & production infrastructure (70 manpower)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Market | 2,200g | **70** | 1 FOOD slot |
| Fur Synthesizer | 2,200g | **70** | 1 SUPPLY slot (hard-capped, never upgradeable — §6.4) + **10 gold/day upkeep** (already has "another slot requirement," no food slot) |
| Ironworks | 2,400g | **70** | 1 IRON slot (hard-capped) + **10 gold/day upkeep** |
| Crystal Synthesizer | 2,800g | **70** | 1 CRYSTAL slot (hard-capped) + **20 gold/day upkeep** |
| Garrison Hall | 2,200g + 80 crystal | **70** | Repurposed (§4.4) — manpower-**cap** booster for its town. **1 FOOD slot + 1 CRYSTAL slot** (advanced-tier gate, per the crystal fix below — scaling manpower infrastructure deliberately draws on the scarcer resource) |
| Governor's Office | 2,600g | **70** | 1 FOOD slot |
| Caravanary | 2,600g | **70** | 1 FOOD slot |
| Airport | 3,000g + 80 crystal build + 0.025 crystal/min ongoing upkeep, ×2/build | **70**, doubling scaling kept | **1 CRYSTAL slot** (replaces the separate per-minute upkeep, §12.1 — no food slot, already has another requirement) |
| Clearing House | 3,000g + 80 crystal | **70** | 1 FOOD slot |

### Tier 3 — major economic engines (180 manpower)

**Crystal fix (this section): Bank, Foundry, Rail Depot, and Radar System
now also draw 1 CRYSTAL slot, on top of their base FOOD slot** — crystal is
deliberately positioned as the material that gates *advanced-tier*
infrastructure specifically (not competing with food/iron on breadth, where
there isn't enough of it — see the crystal-demand discussion this decision
came from). Rail Depot in particular matters: it's part of the
manpower-boosting tree (§4.4), so crystal now directly gates how fast a
player can scale manpower itself, giving crystal a permanent, felt role
instead of being touched twice (Observatory, Airport) and forgotten.

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Bank | 3,200g | **180** | 1 FOOD slot + **1 CRYSTAL slot** |
| Foundry | 4,500g | **180** | 1 FOOD slot + **1 CRYSTAL slot** |
| Rail Depot | 4,000g + 100 crystal | **180** | Manpower-regen network booster (§4.4), already live. 1 FOOD slot + **1 CRYSTAL slot** |
| Radar System | 4,000g + 120 crystal | **180** | 1 FOOD slot + **1 CRYSTAL slot** |
| Advanced Fur Synthesizer | 4,000g + 40 supply | **180** | Still 1 SUPPLY slot (hard-capped), higher output within it + ~15 gold/day upkeep |
| Advanced Ironworks | 4,200g + 40 iron | **180** | Still 1 IRON slot + ~15 gold/day upkeep |
| Advanced Crystal Synthesizer | 4,800g + 40 crystal | **180** | Still 1 CRYSTAL slot + ~25 gold/day upkeep |

### Tier 4 — elite structures (250 manpower)

| Structure | Old cost | New manpower | New slot requirement |
|---|---|---|---|
| Exchange House | 5,000g + 120 crystal | **250** | 1 FOOD slot + **1 CRYSTAL slot** |
| Aether Tower | 6,000g + 160 crystal, ×1.15/build (incremental) | **250**, scaling kept | 1 FOOD slot + **1 CRYSTAL slot** |

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
| Imperial Exchange / World Engine / Aegis Dome / Astral Dock **Part** (×4 per monument) | 8,000g + 180 crystal each | **1,000 each** `[corrected — see §16]` | 1 CRYSTAL slot each |
| Imperial Exchange / World Engine / Aegis Dome / Astral Dock (final assembly) | 18,000g + 2 shard | **1,600** `[corrected]` | 2 SHARD (unchanged — stays event-gated, §5.5) + **1 CRYSTAL slot, permanent upkeep, decided** |

A complete monument: 4×1,000 (parts) + 1,600 (assembly) = **5,600
manpower** total — corrected upward from an original, under-priced 2,200
(§16) — now properly the single largest investment in the game. **Crystal
footprint while all 4 parts stand plus the assembled monument: 5 CRYSTAL
slots total** (4 for the standing parts + 1 for the finished monument's own
upkeep) — a serious, permanent commitment for the player holding the
world's only one of these, and exactly the kind of structure whose
crystal-shortfall dormancy risk is flagged as an open question in §5.4.

---

## 13. Full tech list & pricing `[gold costs decided per-tier in §6.2; strategic-resource costs corrected below]`

Full tech list confirmed directly from `packages/game-domain/data/
tech-tree.json`: **48 techs across 8 tiers** (49 in the live data minus
`Overload Protocols`, removed per §18). **Gold cost is flat per tier**
(§6.2) — every tech in a tier costs the same gold, decided already.

**Correction to an earlier draft of this section**, caught during a later
gap audit: this section originally said every tech "keeps its existing
strategic-resource cost (food/iron/crystal/supply/shard amounts)...
unchanged." That's wrong for the same reason the 17 abilities were wrong
(§17) — `tech-tree.json` costs FOOD/IRON/CRYSTAL/SUPPLY as *quantities*
(e.g. Agriculture costs "40 food," Iron Vanguard-tier techs cost hundreds
of iron), and once those resources are slots, not stockpiles, there's no
quantity left to spend. **Fix: drop the FOOD/IRON/CRYSTAL/SUPPLY cost from
every tech entirely. Keep SHARD unchanged** — shard was never converted to
a slot (§5.5), it stays a real, event-gated stockpile, so a tech that costs
"1 shard" still costs 1 shard. So a tech that today costs, e.g., "14,500
gold + 200 crystal + 1 shard" becomes, under this plan, its new flat tier
price + 1 shard — the crystal number is dropped, not converted onto
anything else. `researchTimeSeconds` stays present in the data but remains
unenforced, per §6.2 (no research timer).

| Tier | Gold (flat, all techs this tier) | Techs |
|---|---|---|
| 1 | **10** | Agriculture, Workshop Standards, Merchant Charters, Cartography, Warbands |
| 2 | **50** | Boiler Alchemy, Field Rigging, Stoneworks, Deep Prospecting, Irrigation, Assembly Guilds, Signal Fires, Aether Moorings |
| 3 | **100** | Brass Drillwork, Ceramic Stores, Royal Mint, Crystal Lattices, Mercantile Ledgers, Survey Corps, Bastion Walls, Siege Towers, Convoy Logistics |
| 4 | **200** | Aether Bridge, Census Records, Dockworks, Beacon Towers, Quartermaster Corps, Deep Extraction, Seedline Granaries — 7 techs, not 8: `Overload Protocols` removed (§18, Synthesizer Overload is removed and this was its only unlock) |
| 5 | **400** | Cipher Bureaus, Aether Engineering, Banking, Provincial Ministries, Rail Networks, Grand Synthesis, Starforged Steel |
| 6 | **500** `[decided]` | Grand Cartography, Monument Cities, Standing Army, Sky Docks, Resonance Grid, Aether Towers |
| 7 | **650** `[decided]` | Imperial Exchange, Aegis Dome, Worldbreaker Cannon, Astral Dock |
| 8 | **800** `[decided]` | Exchange Levy Writs, Worldbreaker Ignition |

Reminder from §6.2: at 10 gold/day/town, this means 1 town sustains a
tier-1 tech per day, 5 towns a tier-2 tech per day, 10 towns a tier-3 tech
per day, 20 towns a tier-4, 40 towns a tier-5.

**Tiers 6–8 were flattened twice, not just once** — the original
continued-doubling curve (80/160/320 towns) was rejected outright: 320
towns for tier 8 is over 100% of the ~300 towns on the map, and even a
first flattening pass (60/90/120 towns) was still too close to
`TOWN_CONTROL`'s victory threshold (≥50% of towns, roughly 150 of ~300) —
a player who could afford tier 8 would already be on the verge of winning
outright via that path, making the tech a moot post-victory footnote
rather than a real goal. **Final: 50/65/80 towns for tiers 6/7/8** — still
clearly growing and exclusive, but reachable well before a player has
already won by a different route.

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

---

## 15. Imperial Exchange Levy — finalized design `[decided]`

Original mechanic (`runtime-map-command-handlers.ts:298-349`): 200 CRYSTAL,
30-min cooldown, takes 25% of a chosen strategic resource's *stockpile*
from **every** non-allied/non-truced player simultaneously. Flagged as
mechanically broken once strategic resources become slots (§5 — there's no
stockpile left to take 25% of), and separately flagged as a flat,
no-counterplay, no-decision ability unworthy of a 2,200-manpower monument.

**Finalized:**
- **Single target**, chosen by the caster (not a blanket hit on everyone).
- **Eligibility gate unchanged**: not allied, not truced (existing check at
  `runtime-map-command-handlers.ts:336` is fine as-is — no additional
  war-only restriction).
- **Takes 100% of the target's gold** (was 25% of a strategic-resource
  stockpile) — a full wipe, not a skim. Only works because gold remains a
  real stockpile under this redesign (§6) — every other strategic resource
  does not, which is exactly why this had to move onto gold.
- **Cooldown: 24 hours** (was 30 minutes) — this is now a rare, high-impact
  strike, not a repeatable passive-income button.
- **No escalating cost for repeat targeting** — considered, rejected. Keep
  it simple.
- **Offline notification is the important part, not a live warning.** When
  a targeted player next logs in, they must see a clear message: *"You were
  hit by an Imperial Exchange Levy while away — lost [X] gold."* This
  matters more than any live telegraph, since a 24-hour cooldown means the
  levy will often land while the victim isn't online. Reuse the existing
  `PLAYER_MESSAGE` broadcast pattern already used for shard rain
  (`messageType: "SHARD_RAIN_EVENT"`, `docs/game-mechanics.md` §12) — same
  plumbing, new `messageType` (e.g. `IMPERIAL_EXCHANGE_LEVY_EVENT`).
- **Activation cost**: **free** — finalized in §17. Two earlier drafts of
  this bullet (gold fee, then a 2-CRYSTAL-slot cost) are both superseded.
  The 24-hour cooldown alone is the entire gate; a full gold wipe on a rival
  once a day doesn't need a resource cost stacked on top of that.

Net effect: press the button once a day at most, pick a specific rival,
take everything they've saved, and they find out when they log back in.
That's a moment worth naming, unlike the old version.

## 16. Monument uniqueness and race visibility `[decided — revised: GLOBAL cap]`

- **Cap each monument type at ONE PER SEASON, globally — not per player.**
  Revised from an earlier per-player-cap draft. There is exactly one
  Imperial Exchange, one World Engine, one Aegis Dome, one Astral Dock
  available in the entire world each season. Whoever completes the final
  assembly first gets it; **no other player can ever build that monument
  type again that season.** This is a much higher-stakes rule than a
  per-player cap — it turns each monument into a single, contestable prize
  rather than a personal luxury every strong empire eventually gets. This
  remains the **first genuinely empire/season-unique structure rule in the
  codebase** — no existing `maxCount` constraint was found anywhere in
  `structure-costs.ts`; needs new validation logic (a season-scoped
  "already claimed" flag per monument type, checked before allowing any
  further `_PART` or assembly builds of that type).
- **Broadcast a warning to all other players the moment any player
  completes the *first* part** of any monument (first
  `IMPERIAL_EXCHANGE_PART`, etc.) — e.g. *"[Player] has begun constructing
  an Imperial Exchange."* Under the global cap this broadcast is no longer
  just flavor — it's the signal that a race for a single, unrepeatable
  prize has started, and it directly motivates scouting, rushing a
  competing build, or attacking the leader before they finish. Same
  `PLAYER_MESSAGE` broadcast plumbing as elsewhere; feeds the events log
  (§20).
- **Monument race consolation, decided**: if two players are racing the
  same monument and one completes the assembly first, **the loser gets
  their invested manpower refunded** on whichever parts they'd already
  built. Losing the race isn't free of consequence (time and the queued
  slot are still gone), but it doesn't destroy the manpower itself —
  keeps a lost race from feeling punishing enough to make players avoid
  attempting one at all.
- **Monument costs were under-priced, corrected.** The original 400
  manpower/part + 600/assembly (2,200 total) was reached by roughly scaling
  each structure's old gold-cost band into a small number of manpower
  "steps," not independently modelled — and for something billed as "the
  single largest investment in the game," 400 barely clears a Bank (180)
  or a Fort (300), which doesn't read as a capstone. **Corrected to 1,000
  manpower per part, 1,600 for final assembly** — a complete monument now
  totals **4×1,000 + 1,600 = 5,600 manpower**, properly the biggest single
  commitment in the game rather than a moderate step up from a Bank.

## 17. Crystal-costing abilities — FREE, cooldown only `[decided — final, supersedes the crystal-slot draft below]`

**This section went through two revisions; this is the final one.** First
draft: relabel the old crystal fee onto gold. Second draft: keep the
ability inside the crystal economy by having it occupy 1–2 CRYSTAL slots
for its own cooldown duration. That second draft is **not** what shipped —
reconsidering it surfaced a real problem: it meant crystal-poor players
(most of the playerbase, given crystal is the scarcest resource in the
game) could be locked out of these abilities entirely, cutting against the
"tall/non-explorer players should still have a chance" principle from
§6.4. **Final decision: all seventeen abilities are FREE, gated only by
their existing cooldown** — no crystal cost, no slot cost, nothing. The
cooldowns (5 minutes to 24 hours) are already a sufficient standalone
pacing lever.

Crystal's demand instead comes entirely from **buildings** — Bank, Foundry,
Rail Depot, Radar System, Exchange House, Aether Tower, and Garrison Hall
(§12 Tier 3/4), plus Observatory, Airport, and the monument structures.
Rail Depot and Garrison Hall matter most: they're the manpower-scaling
structures (§4.4), so crystal ends up gating how fast a player can grow the
game's central resource — a permanent, felt role, instead of being spread
thin across seventeen abilities most players would rarely use.

All seventeen abilities, confirmed directly from `ABILITY_DEFS`
(`server-game-constants.ts:283-351`) and the dedicated monument-ability map
commands, simply drop their old CRYSTAL cost entirely and keep their
existing cooldown unchanged:

| Ability | Requires tech | Old crystal cost | New cost | Cooldown (unchanged) |
|---|---|---|---|---|
| Reveal Empire | cryptography | 20 (+ ongoing crystal upkeep) | **Free** (upkeep also dropped, not just deferred to a slot) | none (toggle) |
| Reveal Empire Stats | surveying | 15 | **Free** | 5 min |
| Survey Sweep | surveying | 30 | **Free** | 12 min |
| Aether Purge | signal-fires | 100 | **Free** | 10 min |
| Aether Bridge | navigation | 30 | **Free** | 30 min |
| Aether Wall | harborcraft | 25 | **Free** | 8 min |
| Siphon | logistics | 15 | **Free** | 10 min |
| Create Mountain | terrain-engineering | 400 | **Free** | 20 min |
| Remove Mountain | terrain-engineering | 400 | **Free** | 20 min |
| Airport Bombard | (Airport) | 200 | **Free** | 20 min |
| Deep Strike | (already costs 120 manpower) | 25 | **Free** (unchanged manpower cost stands alone) | 20 min |
| Naval Infiltration | (already costs 120 manpower) | 30 | **Free** | 30 min |
| Sabotage | — | 20 | **Free** | 15 min |
| Imperial Exchange Levy | exchange-levy | 200 | **Free** | **24 hr** (§15 — the activation-cost note there is also corrected to Free) |
| World Engine Strike | (World Engine) | 500 | **Free** | 60 min |
| Aegis Lock | (Aegis Dome) | 220 | **Free** | 60 min |
| Astral Dock Launch | (Astral Dock) | 300 | **Free** | 90 min |

## 18. Synthesizer Overload — recommend removal, not redesign `[decided]`

`handleOverloadSynthesizerCommand` (`runtime-economic-structure-command-
handlers.ts:96-153`): pay `SYNTH_OVERLOAD_GOLD_COST` gold to instantly add a
burst of resource (`FUR_SYNTHESIZER_OVERLOAD_SUPPLY` /
`IRONWORKS_OVERLOAD_IRON` / `CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL = 10`) to
your stockpile, then the synthesizer goes `inactive` for
`SYNTH_OVERLOAD_DISABLE_MS` before recovering. Gated behind the
`overload-protocols` tech (tier 4, listed in §13).

**This is the same category of problem as Imperial Exchange Levy, but with
no sensible replacement**, unlike the levy: the entire mechanic — burst
extraction now, downtime later — only means something against a
*continuous flow* you can front-load. Under slots, a synthesizer isn't a
flow to burst; it's a binary allocation (one hard-capped slot, on or off,
per §6.4). There's no equivalent action that preserves the "burst now,
pay for it later" shape once there's no flow to burst.

**Recommendation: remove it entirely** rather than force a redesign onto a
model it doesn't fit. Cleanup scope:
- Delete `handleOverloadSynthesizerCommand` and its command
  plumbing/dispatch entries.
- Remove the client button/ability entry.
- Remove now-dead constants: `SYNTH_OVERLOAD_GOLD_COST`,
  `SYNTH_OVERLOAD_DISABLE_MS`, `FUR_SYNTHESIZER_OVERLOAD_SUPPLY`,
  `IRONWORKS_OVERLOAD_IRON`, `CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL`.
- **`Overload Protocols` (tier 4 tech) is removed too, decided** — it has no
  purpose once the ability it unlocks is gone. Tier 4 drops from 8 techs to
  **7**, and the tech list in §13 is updated to match (48 techs total, not
  49). No replacement tech proposed for the vacated slot — tier 4 simply
  has one fewer tech than tiers 2 and 3.

## 19. Full domain list & new costs `[proposed]`

All 25 domains confirmed directly from `packages/game-domain/data/
domain-tree.json` (5 tiers × 5 domains each). Domains differ from tech in
one structural way worth preserving: at a given tier, each of the 5 domains
is tied to a **different** strategic resource (food/iron/supply/crystal),
i.e. tier is a "pick your specialization" choice, not a uniform set.

**Correction, same fix as §13:** an earlier draft of this section said to
leave every domain's specific resource + shard cost untouched. Wrong for
the identical reason — the food/iron/supply/crystal amounts shown per
domain below are quantities, and none of those four resources are
spendable quantities anymore once slots ship. **Drop the food/iron/supply/
crystal amount from every domain. Keep SHARD unchanged** (shard isn't a
slot, §5.5) and rescale gold, flat per tier (proposed ratio: roughly 4×
that tier's new tech cost, matching the old data's existing ~3–4.6×
tech-to-domain ratio). The specific resource listed per domain below is
kept in the table as a record of each domain's *thematic* tie (which
"specialization" it represents), not as a cost that still applies:

| Tier | Old gold (domains) | New gold (flat, all 5 domains this tier) | Domains |
|---|---|---|---|
| 1 | 6,000 | **40** | Frontier Doctrine (+120 food, req. toolmaking), Dwarf Kingdom (+120 iron, req. masonry), Dewildernisation (+120 supply, req. leatherworking), Mercantile Charter (+100 crystal, req. trade), Clockwork Stipend (+120 food, req. agriculture) |
| 2 | 14,000 | **200** | Cogwork Foundries (+220 food, +1 shard, req. logistics), Stone Curtain (+220 iron, +1 shard, req. fortified-walls), Iron Vanguard (+240 iron, +1 shard, req. bronze-working), Scholastic Exchanges (+200 crystal, +1 shard, req. ledger-keeping), Crystal Network (+180 crystal, +1 shard, req. signal-fires) |
| 3 | 24,000 | **400** | Provincial Governors (+320 food, +2 shard, req. coinage), War Foundries (+340 iron, +2 shard, req. organized-supply), Supply State (+320 supply, +2 shard, req. organized-supply), Merchant Houses (+260 crystal, +2 shard, req. coinage), Provincial Nurseries (+340 food, +2 shard, req. pottery) |
| 4 | 38,000–42,000 | **800** | Imperial Roads (+500 supply, +3 shard, req. imperial-roads), Fortress Realm (+540 iron, +3 shard, req. steelworking), Siege State (+220 iron/+520 supply, +3 shard, req. siegecraft), Treasury State (+180 food/+420 crystal, +3 shard, req. banking), Hidden Hand (+420 crystal, +3 shard, req. cryptography) |
| 5 | 60,000–70,000 | **1,800** | Imperial Expansion (+700 food, +5 shard, req. civil-service), Iron Dominion (+800 iron, +5 shard, req. steelworking), Enduring Realm (+650 food/+260 crystal, +5 shard, req. civil-service), Golden Hegemony (+220 food/+600 crystal, +5 shard, req. trade-empire), Oracle State (+650 crystal, +5 shard, req. grand-cartography) |

Note: `Imperial Expansion` (tier 5) and `Frontier Doctrine` (tier 1) are two
of the four `developmentProcessCapacityAdd` doctrines referenced in §4.4 —
their new gold costs (1,800 and 40 respectively) come from this same table,
not a separate number.

---

## 20. Events log — a persistent, scrollable "what happened while I was away" feed `[decided — new feature]`

§15's original design leaned on the `PLAYER_MESSAGE` broadcast pattern for
the Imperial Exchange Levy offline notification, treating it as a one-off
toast. That's not sufficient on its own: a toast is ephemeral — if a player
doesn't happen to be looking when it fires (likely, given some of these
events land while offline), it's gone. What's needed is a **proper,
persistent log the player can scroll back through**, not a fire-and-forget
message. This generalizes and supersedes the plain "reuse PLAYER_MESSAGE"
note in §15/§16.

### Design

- **A dedicated, always-accessible log panel** (not a transient popup).
- **Vertical timeline layout**: an icon per event, with a line of
  descriptive text beside it.
- **Most recent event at the top**, scrollable downward through history.
- **Chronological, one entry per event** — no batching/collapsing distinct
  events into a single line.

### Event types at launch

1. **Imperial Exchange Levy hits** (§15) — *"You were hit by an Imperial
   Exchange Levy by [Player] — lost [X] gold."* Also log the caster's own
   activation as a separate, milder entry (*"You levied [Player] for [X]
   gold"*) so both sides of the interaction are visible in their own logs.
2. **Towns lost** — captured by another player or by barbarians. *"[Town
   name] was captured by [Player/Barbarians]."*
3. **Explicitly designed to be extended** — the user's own framing was "we
   will fill it with more things," so the underlying event-log mechanism
   should be generic (an event type + icon + text template + timestamp),
   not hardcoded to just these two. Natural future additions once this
   exists: monument first-part-completed broadcasts (§16), barbarian
   multiply/walk events affecting the player's border, Ancient Ruins
   discoveries (§7.3), tech completions, town tier-ups.

### Implementation notes

- **Needs real persistence, not just the existing `PLAYER_MESSAGE`
  mechanism.** `PLAYER_MESSAGE` (used today for `SHARD_RAIN_EVENT`) appears
  to be a live, in-session notification — it doesn't obviously give a
  player a scrollback of everything that happened while they were logged
  out. This log needs an append-only per-player event store that persists
  regardless of whether the player was online when the event fired. Reuse
  `PLAYER_MESSAGE` for the *live* toast when the player happens to be
  online at the moment, but the **log itself must be durable**, not
  reconstructed from transient messages.
- **Hook point for "town lost" events**: the single tile-mutation
  chokepoint, `SimulationRuntime.replaceTileState()`
  (`runtime.ts:1539`), is exactly where `docs/game-mechanics.md` §12
  already notes *"No general 'tile state mutated' event yet — adding one
  at this point would catch every relevant change in a single emit."` This
  log is the concrete use case that finally justifies adding that general
  hook, rather than bolting a one-off "did a town flip ownership" check
  somewhere else.
- Respect the **AI CPU guardrails** (`docs/game-mechanics.md` §13,
  `AGENTS.md`) — writing a log entry on every relevant mutation must stay
  cheap; don't scan/rebuild anything expensive per event.

---

## 21. Missing-upkeep indicators — floating badge + detail-panel line `[decided]`

This is the UI for the dormancy state introduced in §5.4 (a structure that
lost its slot allocation goes dormant, not destroyed). **Both pieces the
user asked for already have a directly-reusable existing pattern** — this
is an extension, not new UI from scratch.

### 21.1 Floating badge above the tile (3D map)

`createUnfedBadgeOverlay` (`client-map-3d-unfed-badge-overlay.ts`) already
implements exactly this for unfed towns: a shield-shaped badge floats above
the tile, bobbing gently, showing a resource icon with a red diagonal
prohibition slash over it — driven by `tile.town && !tile.town.isFed`. It's
currently **hardcoded to the food emoji** (🍞, matching `client-panel-html.
ts`'s resource icon set).

**Extension needed:** generalize the overlay to accept *which* resource
icon to draw, instead of a fixed food glyph, and drive it from the
dormancy condition (§5.4: slot demand > supply for that structure) rather
than only `!tile.town.isFed`. The icon set to draw from already exists and
needs no new assets — `client-panel-html.ts:296-299`: 🍞 Food, ⛏ Iron,
💎 Crystal, 🦊 Supply. A dormant Fort missing its IRON slot gets the same
shield-plus-slash treatment with ⛏ instead of 🍞; a dormant Bank missing
CRYSTAL gets 💎; etc. Same `InstancedMesh`/canvas-texture machinery,
parameterized instead of duplicated per resource.

### 21.2 Detail panel line (tile description screen)

`client-tile-menu-view.ts:420` already has the exact pattern for an unfed
town: a plain conditional text line pushed into the panel —
`pushLine("Town is unfed. Add more FOOD upkeep coverage or settle nearby
fish or grain.")`.

**Extension needed:** add an equivalent conditional line for a dormant
*structure* (as opposed to an unfed *town* — a related but distinct
condition once slots exist): something like *"This [Structure name] is
unpowered — missing 1 [resource] slot. Settle or capture a [resource] tile
to restore it."* Same `pushLine` mechanism, gated on the structure's
dormancy state instead of `tile.town.isFed`, sitting alongside the existing
unfed-town line rather than replacing it — a tile could plausibly show
both an unfed-town line and an unpowered-structure line if a player is in
enough trouble.

---

## 22. Bank and Siphon under the new system

Two mechanics whose actual live behavior needed tracing before they could
be ported — both turned out simpler than expected once the real code was
read rather than assumed.

### 22.1 Bank — unchanged effect, upkeep folds into the universal food slot

Traced the real mechanic (`player-update-economy.ts:282-292`): Bank is not
a resource-flow structure at all — it's a **gold-income multiplier on its
town**, ×1.5 (or ×1.7 with a connected Clearing House active), stacking
with Market's own multiplier, connected-town bonus, population tier, etc.
**Plus a flat additive bonus on top: +1 gold/minute (or +1.5/minute with
Clearing House)**, confirmed directly in the formula's final term
(`+ (hasBank ? (clearingHouseActive ? 1.5 : 1) : 0)`).

- **The multiplier effect carries over unchanged** — gold remains real and
  meaningful post-rewrite (funds tech, rush-buys, synthesizer upkeep), so
  "a structure that boosts your gold income" keeps doing exactly the same
  job it always did.
- **The flat add-on rescales like everything else gold-denominated**: old
  +1/min (or +1.5/min) is +1,440/day (or +2,160/day) in the current
  economy; at the same ~288× factor used throughout, that becomes
  **roughly +5 gold/day (or +7.5/day with Clearing House)** — a meaningful
  boost against the new 10-gold/day/town base, not a rounding error.
- **Old FOOD upkeep (0.1 gold/m — wait, food, not gold: `BANK_FOOD_UPKEEP=1`,
  `/10` → 0.1 food/min) doesn't survive as a separate metered drain.** It
  folds into the already-decided universal rule that every building draws
  1 FOOD slot (§5.3) — same treatment already applied to Observatory/
  Airport's old crystal drain (§12.1). Bank's manpower/slot cost is already
  set in §12 Tier 3: **180 manpower + 1 FOOD slot + 1 CRYSTAL slot.**

### 22.2 Siphon — works unchanged, no slot translation needed

Traced the real mechanic (`runtime-siphon-command-handlers.ts`,
`tile-yield-view.ts:242-243`): Siphon requires the caster to have a ready
(off-cooldown) Observatory within 30 tiles of the target — its "cooldown"
*is* an Observatory cooldown stamp, not a separate timer — and applies a
`sabotage` effect to the target tile and its full 3×3 neighborhood for a
duration. `SIPHON_SHARE = 1`, so the effect **completely zeroes** affected
tiles' output for that duration, not a partial debuff.

**Correcting a specific claim made about this ability**: Siphon does
**not** transfer the removed output to the caster. The yield formula
(`tile-yield-view.ts:243`: `goldPerMinute = (townGoldPerMinute +
dockGoldPerMinute) * outputMultiplier`) shows the multiplier only ever
*reduces* the target's own income — there is no step anywhere that credits
the difference to the attacker. `sabotage.ownerId` exists purely for
attribution (confirmed it's referenced only in a test assertion, nowhere in
runtime economy logic) — this is a pure denial/sabotage effect, not a
theft, in the current code. (If a screenshot shows different in-game
copy claiming a transfer, that would be worth flagging as its own
discrepancy the same way the synthesizer upkeep one was — but nothing in
the traced code path supports a transfer.)

**Why this needs zero translation for the slots pillar, unlike almost
everything else touched this conversation**: the sabotage `outputMultiplier`
is applied *only* to `goldPerMinute` (`tile-yield-view.ts:243`) — it is
never applied to `resourceDaily` (the raw strategic-resource yield,
computed entirely separately one line below with no sabotage term at all).
So Siphon only ever debuffs GOLD, regardless of whether the target is a
town or a resource tile — and gold stays a flow resource under this whole
redesign (§6). Siphon works exactly as it does today, no slots-awareness
needed at all. Per §17, its old CRYSTAL activation cost is now free
(cooldown/Observatory-gate only), same as the other sixteen abilities.
