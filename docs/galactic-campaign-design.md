# Galactic Campaign — Design Doc (draft)

Status: **concept / not implemented.** This is the output of a design discussion,
not a build plan. The point of this doc is the shape of the systems and how they
connect. A first-pass set of balance numbers lives in §13 — internally consistent
and checked against each other, but not playtested; treat them as a starting
point for tuning, not as settled constants.

This revision folds in PR #1264 verbatim as §1–14, then adds a review pass and
a visual-presentation spec (§15–16) that PR left open: how the galactic layer
is actually *seen and navigated*, not just how its numbers work.

## 1. What this is

A persistent, slow strategic layer that sits *above* the existing Border
Empires season loop, without changing it. A season (the tile-conquest map
players already play) becomes a **Sector campaign** — a self-contained,
fast, high-agency fight over one planet. The galactic layer is the opposite
in every respect: low-agency, slow, and permanent. It exists to make a
single season's outcome matter beyond that season, not to be a second game
players actively manage.

Two clocks:

- **Sector campaign** — the existing season. Unchanged. Fast, high-agency.
- **Galactic Cycle** — a fixed real-time bookkeeping tick (proposed: monthly)
  governing Senate votes, Project completion, and tier rebalancing. Decoupled
  from season count — see §9.

## 2. Core loop

1. A Sector campaign (season) runs to completion, exactly as it does today.
2. Final standing in that campaign converts to a permanent galactic reward,
   tiered by how well the player did (§3).
3. Held territory (Planets/Outposts) passively generates **Influence** and
   **Production** between seasons (§4, §5).
4. Production funds Wonders and Fleets; Influence funds Senate actions and
   Bloc politics.
5. Held territory can be lost to **contestation** — via Influence deficit,
   a raid, or a Senate vote (§7) — which reopens it as a **Defense Campaign**
   season.
6. The galaxy runs until **saturation** triggers Convergence and a reset
   (§9).

## 3. Rewards: Planet / Outpost / Stipend

Binary win-or-nothing per season was the original draft; it's replaced with
three tiers so a season played well but not won still leaves a permanent
mark:

| Tier | Who gets it | What it is |
|---|---|---|
| **Planet** | Outright victory (any of the 5 conditions, 24h hold) | Full permanent holding. Specialization set by which victory path was won (table below). Generates the full Influence/Production trickle. Counts toward Senate representation and Wonder eligibility. |
| **Outpost** | Strong runner-up: significant hold-progress on a *different* victory path than the winner, or came within a threshold of winning | Minor permanent holding. Smaller trickle, same specialization logic, no Senate seat weight, no Wonder-vote weight. This is the default starting territory for new/emerging empires. |
| **Stipend** | Meaningful participation, no path close to complete | One-time Influence/Production payout scaled to best-path progress. No permanent territory. |

Planet specialization by win condition:

| Won via | Specialization | Leans |
|---|---|---|
| Town Control | Industrial | Production |
| Economic Hegemony | Trade | Influence |
| Resource Monopoly | Extraction | Production |
| Maritime Supremacy | Logistics | Both, smaller |
| Diplomatic Dominance | Capital | Influence |

## 4. Influence

The soft-power currency — politics and starting position, never battlefield
stats. That boundary is load-bearing: Influence must never touch mid-season
tile combat directly, or the two layers stop feeling distinct.

**Generation:** Capital/Trade-specialized Planets and Outposts, at a slow
trickle between Cycles. Also awarded at season end as partial credit
proportional to how far a player got on the Diplomatic Dominance /
Economic Hegemony tracks, even without winning outright — so Influence
flows from ordinary seasons, not only wins.

**Upkeep:** every held **Planet** costs an Influence upkeep that scales
with how much territory an empire holds (Stellaris admin-cap logic).
Spread wide without enough Trade/Capital income to back it, and upkeep
exceeds generation — that's an **Influence deficit**, one of the three
paths into contestation (§7). **Outposts carry no upkeep at all**: they
are the cheap bottom rung of the ladder and the default reward for
new/emerging empires (§3), so charging them upkeep would hand exactly
those players a holding that bleeds them toward deficit. Rates in §13.

**Spends — kept deliberately short.** Three Senate action *categories*,
nothing more: Sanction, Contest, and the next-Sector terrain vote.

Cut from earlier drafts and deliberately left out: generic policy
edicts, solo diplomatic pact-seeding, cross-empire vision sharing,
propaganda strikes. All added complexity without a clear enough payoff
to justify the client/balance surface.

### How a vote works

- Any Planet-holding empire can raise a proposal by paying its Influence
  cost. Solo empires vote individually; Bloc members vote as a single
  weighted bloc (§8), so organizing carries real Senate weight.
- A proposal resolves at the next Cycle tick if it clears quorum (a
  percentage of total galaxy voting weight, not a fixed head count — so
  quorum stays meaningful as the playerbase grows or shrinks), **and**
  carries votes from at least 3 distinct voting entities. The
  distinct-voter floor is the guard against a single mid-sized Bloc
  clearing a weight-only quorum by itself and then piling into the open
  Defense Campaign its own Contest vote just triggered (§7).
- Every sanction and Contest vote has a **cooldown per target**: once
  resolved (pass or fail), the same empire can't be re-targeted by the
  same action for the rest of the current Cycle. This is the guardrail
  against a majority permanently dogpiling one player — a real risk
  once Blocs can vote as a block (pun noted) instead of individuals.

### Sanctions

Each targets a specific empire and lasts for a set number of Cycles once
passed:

| Sanction | Effect | Best used against |
|---|---|---|
| **Embargo** | Reduces the target's Influence/Production trickle for the sanction's duration | An empire spreading wide without the Trade/Capital income to back it — pushes them toward Stability-draining deficit (§7) |
| **Blockade** | Increases the target's outbound Fleet travel time | A serial raider — blunts their reach without touching their existing holdings |
| **Weapons Inspection** | Reveals the target's Fleet compositions and Garrison strength to the whole Senate | Countering a telegraphed Dreadnought buildup before it launches |
| **Travel Ban** | Bars the target from launching new raids for the sanction's duration | Cooling down a serial raider outright, heavier than Blockade |
| **War Reparations** | One-time forced Production/Influence transfer from the target to the proposer | Punishing an empire whose raid or Contest vote against someone else just failed — a real cost for a failed aggression |

### Contest

The political route into contestation (§7), independent of Stability:
a passed Contest vote forces a target's held Sector into a Defense
Campaign regardless of how healthy that Sector's Stability currently is.
It costs more Influence to raise than a Sanction and needs a higher
quorum to pass, in line with it being the most direct galactic-layer
weapon in the game — a group of empires can end a rival's hold on a
Sector without ever building a Fleet.

### Next Sector terrain

Lighter-weight than the other two: no target, just a vote on the map
archetype (continents vs. island-heavy, etc.) for the next Frontier
Sector to open, reusing the existing per-season map-style variation.
Lets factions lobby for a map that favors their strengths — a maritime
Bloc pushing for island-heavy, a landlocked one pushing for continents.

## 5. Production, Wonders, Fleets

Production is the hard-output currency: it builds permanent things.

- **Wonders** — globally-unique galactic projects, one instance ever,
  refund-the-near-loser-if-close (same pattern as the existing Monument
  system). Each grants the owner a standing effect until someone else
  eventually out-produces and supersedes it (mirrors Monuments being
  globally unique at any given time, not a permanent one-time claim).
- **Fleets** — see §6.
- **Garrisons** — defensive Production sink at the Sector level; raises
  the Stability cost of a successful raid against that Sector (§7).

### Wonder roster

Six, deliberately spread across different levers rather than all being
"win harder" buttons — a couple are explicitly defensive/political so
Production has a use beyond funding aggression:

| Wonder | Cost tier | Effect |
|---|---|---|
| **Dyson Array** | High | Owner's next Sector campaign starts with a permanent manpower-regen head start for the whole season |
| **Grand Exchange** | Medium | Owner (and Bloc-mates, if in one) get reduced Senate proposal costs |
| **Deep Sensor Array** | Medium | Owner's next Sector campaign starts with expanded starting vision radius, reusing the existing Observatory vision model |
| **Orbital Shipyards** | High | Reduces Fleet Production cost for the owner; the direct Production→military efficiency play |
| **Aegis Relay** | High | Passive Stability regeneration bonus across all of the owner's held Sectors — the defensive answer to raids and deficit |
| **The Long Signal** | Medium | Grants the owner an extra Contest-vote token per Cycle — Production buying political leverage, not just economic or military edge |

### Supersession

When a rival's committed Production passes the current owner's on a
Wonder, the owner gets a **one-Cycle grace period** before the effect
transfers — no jarring mid-Cycle flip, and one last Cycle to re-commit
Production and hold it. If the transfer completes, the losing owner is
refunded **50% of their invested Production**, which reuses the same
softened-loss logic as the Stipend tier (§3) so losing a Wonder race
isn't a total wipe.

**Aegis Relay + Bloc mutual defense:** these do not stack. A Sector can
draw on one defensive backup source per Cycle — Aegis Relay's passive
regen *or* a Bloc-mate's reinforcement (§8), not both. Without this,
a Bloc holding Aegis Relay compounds the anti-snowball risk §8 already
carries.

## 6. Fleets

Fleets are galactic-layer assets — they never fight tile battles, and
raids resolve as a short auto-computed engagement (fleet vs. Garrison),
not a second real-time combat game.

**A scope correction that belongs on the record.** The physics grounding
below was researched against games like Cosmoteer, NEBULOUS: Fleet
Command, and Highfleet — but those are games where ship design *is* the
entire session, played for hours at a stretch. That's the wrong
reference class for a decision made every few weeks inside a layer
that's supposed to stay low-agency (§1). The right comparison for the
*interaction weight* is a Civilization production-queue order or a
Clash-of-Clans raid: pick a composition, commit, wait, see the outcome —
a couple of clicks, not a build screen. The physics stays, because it's
what makes hull identity legible without a wiki; a spatial module editor
and a per-tick fuel resource to babysit while a fleet is deployed do not
— both were cut for adding real-time-game complexity to a layer that
needs to work asynchronously over weeks.

**Grounding, not magic.** No shields-as-forcefield, no faster-than-real
travel. Stats are drawn from real constraints, the way Aurora 4X and
*Children of a Dead Earth* build hard-SF combat, so trade-offs make
physical sense instead of being arbitrary slot fillers:

- **Mass** — hull tonnage. More mass = more slots, but higher Production
  cost and lower acceleration for a given engine (thrust-to-mass).
- **Delta-v / fuel** — Tsiolkovsky rocket-equation flavor: fuel mass
  eats into the same budget as weapons and armor. Determines how far and
  how fast a fleet can cross the galaxy — this is what sets a raid's
  **travel time**.
- **Power** — reactor output, shared budget that weapons, engines, and
  point-defense all draw from.
- **Heat** — waste heat needs radiator surface area to dissipate (no
  convection in vacuum, so this is a real constraint, not flavor text).
  Radiators are also a detectable signature — a ship running hot is a
  ship that can be seen coming, which is the real-physics basis for any
  detection/stealth mechanics rather than magic cloaking.

**Weapons**, each with a real-world basis and a real counter, not a
damage-type triangle invented for balance's sake:

- **Kinetics (railgun/coilgun)** — damage from projectile mass ×
  velocity²; power-hungry, good against armor.
- **Directed energy (lasers)** — instant hit, falls off with range
  (inverse-square), draws heavily on the power/heat budget, good
  against shields-that-aren't-shields (thin-skinned targets).
- **Missiles/torpedoes** — high burst damage, finite magazine (a real
  logistics constraint), interceptable by point-defense.
- **Point-defense / armor** — the defensive layer, physical rather than
  a forcefield: ablative plating and interception, not a magic bubble.

**Hull classes** — a tech-gated tier ladder (Corvette → Cruiser →
Dreadnought, Stellaris/MOO-style), each a distinct point in the
mass/delta-v/weapon trade space rather than just a bigger number:

| Class | Profile | Role |
|---|---|---|
| Scout | Minimal mass, huge delta-v, unarmed/token PD | Reveals a target Sector's Garrison before a real raid is committed |
| Raider | Light, high delta-v, kinetic/missile-armed, thin armor | Fast plunder strikes — quick there, quick back, can't slug it out |
| Battleline | Balanced mass/delta-v, mixed loadout, real armor | The Garrison-breaker workhorse |
| Dreadnought | Huge mass, low delta-v, massive weapons/armor | Can force Stability to zero in one strike, but slow — the long travel time telegraphs the raid, giving the defender (and their Bloc) a real window to reinforce before it lands. This is also what keeps raids from feeling like an unfair, agency-free ambush. |
| Tanker | Carries fuel/ordnance | Extends a raiding fleet's effective range, à la Distant Worlds supply logistics — a vulnerable escort target in its own right |

**Illustrative relative stats** (1–5 scale, not real units — purely to
show the shape of the trade-off; actual balance numbers are a later
pass):

| Class | Mass | Δv | Weapons | Armor | Travel speed |
|---|---|---|---|---|---|
| Scout | 1 | 5 | 1 | 1 | 5 |
| Raider | 2 | 4 | 3 | 2 | 4 |
| Battleline | 3 | 3 | 4 | 4 | 3 |
| Dreadnought | 5 | 1 | 5 | 5 | 1 |
| Tanker | 3 | 2 | 1 | 2 | 2 |

Read the Dreadnought row as the point of the whole system: highest
weapons and armor, lowest travel speed. It can break a Garrison in one
strike, but it's the slowest thing in the galaxy doing it — the counter
to "raids feel like an unfair ambush" is built into the stat block
itself, not bolted on as a separate rule.

### Composition, budget, and blueprints

Sending a fleet is one screen, not a session:

- **A single Fleet Production budget**, not a per-hull cost — the player
  spends a lump of Production across however many hulls they want. One
  Dreadnought and five Raiders can be the same total bet, and quantity-
  vs-quality is the actual decision, not a stat comparison (this is the
  one idea worth keeping from NEBULOUS: Fleet Command's editor — the
  budget-across-a-task-force part, not the editor itself).

  Because raid damage is dealt at 1:1 with committed Production (§13),
  cost and combat value collapse into one number per hull — which is
  the cleanest way to express hull identity in a budget model:

  | Class | Prod cost | Damage delivered | Travel |
  |---|---:|---:|---|
  | Scout | 25 | — (reveals target Garrison) | fastest |
  | Raider | 80 | 50 (can plunder without breaking Stability) | fast |
  | Battleline | 200 | 200 | medium |
  | Dreadnought | 500 | 600 | slowest |
  | Tanker | 60 | — (extends fleet range) | slow |

  The Dreadnought is the only hull that returns more damage than it
  costs. That over-delivery *is* its identity, and it's paid for in
  travel time — the same trade-off the relative-stat table above
  describes, priced.
- **Weapon emphasis is one choice per fleet** (kinetic / energy / missile
  leaning), not a per-hull loadout screen — enough to make the
  rock-paper-scissors counters in the weapons list above matter, without
  turning fleet assembly into a build screen.
- **Blueprints**: save a composition once, reuse or re-send it later
  without re-deciding every time (the one genuinely worth borrowing from
  Cosmoteer — it *reduces* repeat decisions rather than adding load, which
  is the right direction for a slow layer). Bloc-mates can share
  blueprints with each other.

### Defense posture

The raid-agency question from earlier discussion — a defender needs a
real choice, not a silent dice roll — has to be answered asynchronously,
since nobody can be guaranteed online at the moment a raid happens to
land. So instead of a live reactive window (the FTL/Into the Breach
answer, and the wrong one for a game that ticks over days): a **standing
defense posture**, set once ahead of time and left in place until
changed — e.g. prioritize armor, prioritize point-defense, or hold
Garrison Production in reserve — auto-applies the moment a raid is
detected inbound. Same fairness principle as the travel-time telegraph
(full information, a real prior decision shapes the outcome), none of
the "be online right now" requirement.

Precedent this leans on: Master of Orion/Galactic Civilizations/Stellaris
for tiered hull classes as an identity ladder; Aurora 4X and
*Children of a Dead Earth* for delta-v/thermal/kinetic-energy grounding;
NEBULOUS: Fleet Command for the whole-force budget; Cosmoteer for
blueprints. Deliberately *not* leaned on for interaction weight: none of
those games' actual build/combat screens belong here — see the scope
correction above.

## 7. Stability and contestation

Every held Planet/Outpost has a **Stability** meter. Three independent
ways to drain it to zero, all converging on the same outcome:

1. **Influence deficit** — sustained economic neglect (§4).
2. **Raid** — a Fleet beats the Sector's Garrison (§6).
3. **Senate Contest vote** — a political majority forces it open regardless
   of current Stability (§4).

**Deficit drains one Sector at a time, not all of them.** While an
empire's net Influence is negative, the drain applies only to its
*single lowest-Stability* held Sector; everything else holds. Draining
every Sector uniformly would mean they all start at full and all hit
zero on the same Cycle — one bad Cycle would dump an empire's entire
holdings into the Defense Campaign queue at once, which at observed
season lengths is a multi-week backlog from a single player. Staggering
it keeps the same total pressure, and reads better besides: the frontier
crumbles first, not the whole empire simultaneously.

Stability hitting zero opens a **Defense Campaign**: a full Sector
campaign season, **open to anyone**, not a defender-vs-challenger duel.
The former owner gets a one-time starting bonus scaled to their sunk
Garrison Production (extra starting manpower or a pre-settled tile) —
real, but not an unbeatable head start. Everyone else can enter,
including empires with no hand in weakening the Sector.

Two things make open-to-anyone the better call than a scoped duel.
It sharpens the anti-snowball intent — a large empire that slips into
deficit or eats a raid can lose the Planet to a rival who never fired a
shot, so weakness draws a crowd. And it's *less* infrastructure, not
more: a Defense Campaign becomes structurally identical to a Frontier
campaign, differing only in the prize and the incumbent's head start.
One campaign type, two prize configurations — reusing existing
open-campaign matchmaking rather than building a bespoke lobby.

Garrisons (Production), the defender's standing Defense posture (§6),
and Bloc mutual defense (§8) restore or protect Stability before it
breaks.

**Battle log:** every raid resolution posts to a galaxy-wide public log
on the map — attacker, defender, outcome, nothing hidden. Cheap to build
(it's a feed, not a system) and it's what turns a raid from a private
stat change into something the rest of the galaxy sees and reacts to —
the EVE Online precedent for why losses read as drama instead of as a
punishment.

There's no special "leader" carve-out here — this applies uniformly to
any territory-holding empire. Bigger empires are *emergently* more
exposed (more upkeep, more to plunder), not singled out by rule.

## 8. Alliance Blocs

A Bloc is a persistent, account-level entity — unlike in-season
alliances, which still form and break per season exactly as they do
today. Extends the existing alliance/truce system upward rather than
replacing it:

- **Shared treasury** — members pool a cut of Influence for joint Senate
  votes and Wonders too expensive for one empire alone.
- **Mutual defense** — members can remotely contribute Production to
  reinforce another member's Garrison mid-raid.
- **Senate representation by Bloc**, weighted by size/stability — makes
  organizing matter more than solo-maxing Influence.
- **Tactical pre-alliance** — bloc-mates landing in the same new Sector
  campaign start already allied in-game, a direct use of the existing
  tactical alliance system.
- **Shared Diplomatic Dominance credit** — a bloc win on that path grants
  Influence to every member, not just the top scorer.
- **Betrayal cost** — breaking Bloc trust costs Influence or temporarily
  strips Senate vote weight, extending the existing truce-break lockout
  concept upward instead of leaving consequences purely in-season.

### The brake: Bloc Sprawl Upkeep

Pooled treasury + mutual defense would otherwise make a top Bloc
progressively *harder* to dislodge the larger it gets — undermining the
exact anti-snowball pressure Stability exists to apply. The brake reuses
the lever the rest of the doc already uses rather than inventing a new
one: the shared treasury pays its own **Influence upkeep scaling with
(member count × combined Planets)**, drawn automatically each Cycle.
Growing the Bloc costs the Bloc, by the same mechanic players already
understand at the empire level (§4). Rate in §13.

The second half of the brake is the Aegis Relay non-stacking rule in §5:
a Sector draws on one defensive backup per Cycle, never both a Wonder
and a Bloc-mate.

## 9. Pacing

Cycle length (bookkeeping) is decoupled from how many Sectors resolve —
this was a real error in an earlier draft. Observed season length in
production is closer to a week than the 30-day ceiling
(`SEASON_LENGTH_DAYS`), so a sequential single-stream galaxy could see
several Sectors resolve per Cycle, not one. Locking "12 Cycles = 12
Planets" would have been wrong on real numbers.

Instead:

- Size the galaxy's total Sector count to roughly the active playerbase,
  so scarcity is meaningful without waiting a long time to feel any
  contestation.
- No hard calendar reset. **Convergence** (the year-end event: leaderboard
  snapshot, Hall-of-Fame record using the existing cosmetics/history
  persistence, then galaxy reset) triggers on **saturation** — e.g. ≥90%
  of Sectors claimed and broadly stable — rather than a fixed date. This
  is robust to season cadence changing as the playerbase grows or shrinks;
  a fixed 365-day countdown isn't.

## 10. Tiered progression and Frontier access

Empires bucket into standing tiers by Planet/Outpost count and Stability
(proposed: Unclaimed → Emerging → Established → Dominant). New Frontier
Sectors route to the lowest tier with enough queued players — weighted
toward the have-nots, not exclusive to them. Established/Dominant empires
still get occasional Frontier access, just lower priority; their main
growth path is contesting existing territory (raids, Senate Contest
votes, waiting out a rival's deficit) rather than endless free land
grabs. Outposts (§3) are the natural starting rung on this ladder.

## 11. Architecture and scheduling

- The galactic Empire record must be its own persistent store keyed by
  account (`galacticEmpireId`), **not** embedded in `SimulationRuntime` or
  season state — written to only via an explicit "apply galactic rewards"
  step hooked into season-end/archive, so it survives the wipe-and-replace
  that season rollover already does today.
- `SeasonState` needs a `sectorId` / `galacticEmpireId` foreign key and an
  immutable final-standing snapshot captured before archive.
- Actual concurrent multi-world hosting (multiple `SimulationRuntime`
  instances, matchmaking, per-world routing in the realtime gateway) is a
  separate, real infra project — sequenced after the core loop is proven,
  not before. Even the "raid" and "Senate Contest" paths into a Defense
  Campaign season need a scheduler decision (what runs next in a
  single-stream queue) before concurrency exists at all; that scheduler is
  part of the v0 scope, concurrency isn't.

### Scheduler policy (single-stream)

With one season running at a time, something has to decide what runs
next. The policy:

- **Defense Campaigns take priority** over fresh Frontier campaigns, so a
  contested Sector's limbo is bounded by the currently-running season
  rather than an arbitrary backlog.
- **Within the Defense tier, oldest-contested-first**, so no single
  Sector can be perpetually skipped.
- **Every third campaign slot is reserved for a Frontier campaign**,
  regardless of Defense backlog. Strict priority alone would starve the
  Frontier queue — and since Frontier Sectors are how new and
  planet-less empires get on the board at all (§10), an unbroken run of
  Defense Campaigns would silently switch off the entire catch-up path.
  The reserved slot is what keeps that on-ramp open.

**Limbo handling:** a Sector whose Stability has hit zero has its
trickle **paused, not decayed**, until its Defense Campaign runs. A
decay penalty was considered and cut — it's another number to balance
for little gain once priority scheduling already bounds the wait.

## 12. Recommended build order

Don't build all of this at once — the point of phasing is to answer "is
the core hook fun" before spending budget on the rest.

- **v0** — persistent Empire record, Planet/Outpost/Stipend claims at
  season end, specialization mapping, Production funding 1-2 Wonder-style
  starting bonuses for the claimant's next season. No Influence, no
  Senate, no Fleets, no Blocs.
- **v1** — Influence, upkeep, Stability, Senate's three actions. This is
  where contestation and the anti-snowball pressure come online.
- **v2** — Fleets and raids (needs Stability from v1). Alliance Blocs
  (needs raids to exist to matter; their anti-snowball brake is specified
  in §8 and priced in §13, so this no longer blocks the phase).

## 13. Balance numbers (first pass)

Every number here is a starting point for playtesting, not a claim about
what's correct. They are collected in one section on purpose: a balance
pass should be able to retune the whole economy from one place, and the
prose above should never hardcode a value that also lives here.

Two units: **Inf** (Influence) and **Prod** (Production), both per Cycle
unless stated otherwise.

### Trickle

| Specialization | Planet Inf / Prod | Outpost Inf / Prod |
|---|---:|---:|
| Capital, Trade | 6 / 8 | 2 / 3 |
| Industrial, Extraction | 2 / 24 | 1 / 8 |
| Logistics | 4 / 16 | 1 / 5 |

### Influence upkeep

- **Planets:** 3 Inf each for the 1st–3rd, then +1 per additional Planet
  (4th costs 4, 5th costs 5, and so on).
- **Outposts:** 0. See §4 for why.

Two worked examples showing the intended pressure:

- **2 balanced Planets** (1 Capital + 1 Industrial): 8 Inf trickle − 6
  upkeep = **+2 Inf**. Healthy.
- **5 Planets, none Capital/Trade:** 10 Inf trickle − 18 upkeep =
  **−8 Inf**. A real deficit — this is the "spread wide without
  Trade/Capital backing" pressure from §4 doing its job.

**Consequence worth stating out loud:** this curve puts the break-even
point around 3–4 Planets for a mixed empire, which makes §10's
"Dominant" tier a precarious position rather than a comfortable one —
any shock (an Embargo, a lost Trade Planet) tips a large empire
negative. That's treated here as intended, since anti-snowball pressure
is the doc's stated goal, but it is a design choice and not a
side-effect: soften the curve if playtesting shows the top of the ladder
is unreachable rather than merely precarious.

### Stability

- Range 0–100 per Sector.
- **Deficit drain:** −8/Cycle, applied to the empire's single
  lowest-Stability Sector only (§7).
- **Recovery:** +15/Cycle to all held Sectors while net Influence is
  positive, capped at 100.
- **Raid damage:** equal to the attacking fleet's delivered damage (§6),
  1:1 with committed Production. No divisor — an earlier draft's ÷8 put
  raid costs roughly 30× out of reach of the Production economy, which
  would have quietly deleted raiding altogether.
- **Garrison:** cancels incoming raid damage 1:1 up to its own Production
  value. So breaking a full-health Sector needs damage exceeding
  (Stability + Garrison) — 200 against a 100/100 Sector, which is exactly
  one Battleline.

### Fleets

Costs and delivered damage are in the §6 hull table. For scale: an
empire holding 4 Extraction Planets banks 96 Prod/Cycle, so a 200-Prod
Battleline raid is ~2 Cycles of saving and a 500-Prod Dreadnought is
~5. That's the intended raid cadence — frequent enough to be a live
threat, slow enough that each one is a real commitment.

### Wonders

- **High tier** (Dyson Array, Orbital Shipyards, Aegis Relay): 700 Prod.
- **Medium tier** (Grand Exchange, Deep Sensor Array, The Long Signal):
  350 Prod.
- Supersession refund: 50% of invested Production (§5).

At 96 Prod/Cycle a committed empire reaches a High-tier Wonder in
roughly 7 Cycles — deliberately competing for the same Production that
funds raids and Garrisons.

### Senate

| Action | Cost | Quorum | Duration | Cooldown per target |
|---|---:|---:|---|---|
| Sanction | 15 Inf | 25% | 2 Cycles | 1 Cycle |
| Contest | 40 Inf | 40% | — | 2 Cycles |
| Terrain vote | 10 Inf | 20% | — | none |

All quorums additionally require **≥3 distinct voting entities** (§4).

### Blocs

**Bloc Sprawl Upkeep:** 0.1 Inf per member-planet, where member-planets
= (member count × combined Planets), drawn from the shared treasury each
Cycle. A 5-member Bloc holding 20 Planets between them pays 10 Inf/Cycle;
an 8-member Bloc holding 32 pays ~26.

The rate matters more than it looks. An earlier figure of 0.5 was
checked against treasury income and turned out insolvent — because the
treasury holds only a *fraction* of members' pooled Influence, a
multiplicative upkeep at that rate costs a large Bloc more than the
treasury ever collects, making Blocs impossible rather than merely
expensive. 0.1 bites without being fatal; any retune should be
re-checked against the pooling percentage, not against members' gross
income.

### Stipend

`(10 × progress)` Inf + `(40 × progress)` Prod, where `progress` is the
player's best-path completion fraction at season end. A near-miss (0.9)
pays 9 Inf + 36 Prod — roughly a Cycle and a half of a small empire's
income, meaningful as a consolation without rivalling a Planet.

## 14. Open questions before implementation

- **The numbers in §13 have not been playtested.** They are internally
  consistent — trickle, upkeep, raid costs, and Wonder prices were
  checked against each other — but internal consistency is not balance.
- **Defense Campaign entry conditions in practice:** §7 settles that
  they're open to anyone, but not the minimum viable entrant count, or
  what happens if nobody challenges an incumbent at all.
- **Convergence reachability:** §9 triggers Convergence on ≥90% of
  Sectors claimed *and broadly stable*. If the §13 upkeep curve keeps
  large empires permanently near break-even, "broadly stable" may be
  harder to reach than intended — worth simulating before committing to
  the saturation trigger.
- **Blueprint sharing scope** (§6): Bloc-wide only, or galaxy-wide
  publishing? The latter is a real community feature but also a
  homogenizing force on fleet composition.

## 15. Review pass: is this actually fun, and what's missing

### 15.1 What makes a meta-layer fun, in comparable games

Genre precedent (Civ's tech tree, EU4's mission trees, Stellaris'
empire sprawl, Clash of Clans' base-building, mobile idle-empire
layers, EVE's null-sec sovereignty) converges on a short list of things
that make a slow layer feel worth returning to, rather than feeling like
homework attached to the game people actually came to play:

1. **The layer must be *seen*, not just read as numbers on a screen.**
   Clash of Clans' base and Civ's map are the product, not a stats
   panel — players return because there's a place to look at, not a
   spreadsheet to check. A galactic layer represented only as Influence/
   Production counters and a Senate ballot is invisible in exactly the
   way that kills return visits. This is the biggest gap in §1–14 as
   written: every mechanic is specified, but there is no answer to "what
   does a player actually look at between seasons?" §16 below is the
   direct answer to this gap.
2. **Legible ownership beats abstract stats.** EU4 and Stellaris both
   put the player's territory *on a map they can point at* — "that
   province is mine" reads instantly; "I have 340 mana and a modifier"
   does not. §3's Planet/Outpost/Stipend ladder is the right shape
   (visible tiers, not a hidden score), but it needs a visual home to
   land — see §16.
3. **Idle progress needs a return hook, not just accrual.** Trickle-and-
   spend systems (mobile 4X empire layers, idle games generally) keep
   players coming back only if there's something to *decide* on each
   visit — a Senate vote to cast, a raid to notice, a Wonder race to
   check on — not just a number that went up. §4's Senate actions and
   §7's battle log already do this reasonably well; the risk is that
   without a visual staging ground (§16), the "something to decide" is
   buried in a menu rather than something a player notices on login.
4. **Loss must sting without being catastrophic, or players disengage
   entirely.** This is Stellaris' actual failure mode in its own
   late-game snowball problem, and also EVE's answer to it (null-sec
   sov is genuinely losable, which is why it matters) — the doc's
   Stability/contestation design (§7) and the softened-loss patterns
   (Outpost tier, Stipend, Wonder supersession refund) are already well
   aligned with this. This is a strength of the current doc, not a gap.
5. **Social visibility drives engagement more than mechanical depth.**
   The battle log (§7) and Bloc politics (§8) are the doc's answer to
   this, and they're the right answer — EVE's "everyone can see your
   losses" and Clash of Clans' friendly-war visibility are both proven
   patterns. Worth strengthening: the doc has no equivalent "everyone
   can see your *gains*" moment — a claimed Planet, a completed Wonder,
   a won Senate vote currently only shows up as a log line, not a
   spectacle. §16.5 proposes a fix.

### 15.2 Gaps and logic issues in §1–14

- **No visual/spatial model at all.** Already flagged in 15.1(1) — this
  is the largest gap, addressed in §16.
- **Circular dependency in the v2 build order (§12) is resolved but
  worth restating plainly:** Blocs need raids to matter, raids need
  Stability, Stability ships in v1. So the true dependency chain is
  v0 → v1 (Stability/Senate) → v2a (Fleets/raids) → v2b (Blocs). The doc
  already sequences it this way in prose; it should be reflected as an
  explicit v2a/v2b split rather than a single "v2" bullet, so a partial
  v2 ship (Fleets without Blocs) isn't read as a phasing mistake.
- **Defense Campaign minimum-entrant question (already flagged in §14)
  has a real failure mode worth naming:** if a Sector's incumbent was
  strong enough to reach Dominant tier, weaker empires may rationally
  decline to contest it even when it opens, since the incumbent's
  starting bonus plus their general strength makes the fight a bad bet.
  An empty or single-entrant Defense Campaign is a worse outcome than
  the mechanic intends — it hands the Sector straight back with no
  actual contest. Needs either a floor incentive (bonus reward for
  anyone who enters a Defense Campaign regardless of outcome, funded
  by the same Stipend logic as §13) or an explicit fallback (auto-return
  to incumbent if entrants < 3, refunding the raider/Senate-voter who
  triggered it).
- **Convergence reachability (already flagged in §14) compounds with
  the upkeep curve in a way worth stating precisely:** §13 says the
  break-even point sits around 3-4 Planets, and §9 wants ≥90% of Sectors
  "broadly stable" to trigger Convergence. If most successful empires
  hover near break-even by design, "broadly stable" is fighting the
  same anti-snowball pressure the doc wants — these two design goals
  need to be checked against each other in a simulation before either
  number is treated as final, not just each in isolation as §14 does.
- **No decay/endgame pressure independent of Convergence.** Without a
  visible countdown or escalating pressure as saturation approaches, the
  "no hard calendar reset" design (§9) risks the opposite problem to a
  fixed reset: nothing signals "the galaxy is closing" until it suddenly
  does. A saturation percentage displayed galaxy-wide (tied into the
  visual layer in §16) would give players the same anticipation a
  visible timer gives, without reintroducing the fixed-date problem §9
  was written to avoid.
- **Bloc Sprawl Upkeep (§8/§13) has no stated way for a Bloc to shrink
  the number back down deliberately** (e.g. a member leaving, or the
  Bloc voluntarily dropping weaker holdings) versus it only ever
  climbing as the Bloc succeeds. Worth a line confirming this is
  intentional (upkeep as an ever-rising cost of success) rather than an
  oversight.
- **Fleet travel time and the Sector campaign clock aren't reconciled.**
  §6 sets travel time from delta-v, and §7 relies on that travel time to
  give the defender a "real window to reinforce," but no example ties a
  concrete travel time to the Cycle length from §9 (proposed monthly).
  If a Dreadnought's telegraphed travel time is, say, 3 days against a
  30-day Cycle, the numbers work; if it's 25 days, the raid mechanic
  barely functions within a single Cycle. This needs at least one worked
  example alongside the existing Prod/Cycle raid-cadence example in §13.

### 15.3 Net fun assessment

The core loop (§2) and its anti-snowball machinery (§7, §8's brake, the
tiered rewards in §3) are sound and match patterns that work in
comparable games — this is not a design that needs to be rebuilt. What
keeps it from clearing the bar on its own is the gap in 15.1(1): every
system here is legible as a rulebook, but none of it is legible as a
*place*. A Senate ballot and an Influence counter are correct
mechanically and forgettable experientially. The fix isn't more systems,
it's giving the systems that already exist a map to live on — which is
what §16 is for.

## 16. Visual layer: the galactic map as a navigable space

### 16.1 Why this is the missing piece, not an extra feature

§1-14 fully specify *what happens* in the galactic layer and *why*, but
never specify *what the player looks at*. Per §15.1, that's the
single biggest risk to this layer actually getting played rather than
ignored between seasons. This section specifies the presentation layer
that every mechanic above needs a home inside.

The concrete reference (see the attached screenshots from a planetarium
session): a planet rendered against a star field, with the ability to
zoom out to reveal its orbital context — moons, then its path around
its star — and zoom out further still to reveal the wider system as
points of light against the galaxy, each selectable to zoom back in.
That zoom continuum — planet → moons → orbit-around-star → system among
neighboring systems → galaxy of dots — is the model to build the
galactic meta-layer's presentation on.

### 16.2 The four zoom levels

A single continuous camera, not four separate screens — the transition
between levels should read as flying the camera back, matching the
reference screenshots, not as a menu swap:

1. **Planet view (closest).** The player's own held Planet/Outpost,
   rendered as a body in space (reusing the specialization art —
   Industrial, Trade, Capital, etc. — as distinct planet skins/textures
   rather than a generic sphere). This is where per-Planet actions live:
   Garrison investment, defense posture (§6), viewing current Stability
   (§7) as a visible property of the body itself (e.g. a glow/health
   ring) rather than a separate bar in a menu.
2. **System view (zoom out one step).** Reveals the Planet's moons (if
   any Outposts are modeled as moons of a parent Planet — see 16.4) and
   the orbital path around the system's star. This is the natural home
   for a claimed multi-body holding: a Planet with its Outposts orbiting
   as moons reads immediately as "this is my system," which is the
   legible-ownership property §15.1(2) calls out as missing.
3. **Local neighborhood view (zoom out again).** The player's system
   takes its place on its own orbital track around the galactic layer,
   with a handful of neighboring systems visible nearby — rival empires'
   claimed systems, contested Sectors mid-Defense-Campaign (visually
   distinct — flagged/flickering), and unclaimed Frontier Sectors.
   Fleet travel (§6) animates here as a visible line/token moving
   between systems over its travel-time duration — the same "full
   information, no ambush" telegraph §6 already specifies mechanically,
   now something the player can actually watch happen.
4. **Galaxy view (furthest out).** All Sectors as points/dots across
   the full galactic map, colored/grouped by owning empire or Bloc.
   Selecting a dot flies the camera in through neighborhood → system →
   planet for that Sector, with a summary card (owner, specialization,
   Stability, current status: stable / contested / Defense Campaign
   live) appearing as the camera arrives — not before, so the zoom
   itself carries information (you don't know a system's fate until
   you're close enough to see it, matching the "fog of distance" framing
   real astronomy has anyway). This view is also the natural home for
   the saturation percentage from 15.2's decay-pressure gap, and for
   the Bloc-territory clustering that makes an Alliance Bloc (§8)
   visually read as a bloc, not just a roster entry.

### 16.3 A held Planet's win *is* owning its solar system

Extending the reference screenshots' idea directly into the reward
model in §3: winning a Sector campaign shouldn't just grant a Planet as
a data record — it should grant the player **that Planet's system**,
i.e. the star, the Planet, and the orbital slot structure around it,
as their visible piece of the galaxy view. Concretely:

- A **Planet** (§3's top reward tier) claims the system: the star and
  the Planet's own orbital position are "owned," and any Outposts that
  empire later claims which are modeled as belonging to the same system
  render as moons or secondary bodies orbiting that Planet, not as
  unrelated dots elsewhere in the galaxy. This gives multi-Sector
  empires an actual *shape* — "my empire is these three systems, each
  with its moons" — rather than a flat inventory count.
- An **Outpost** claimed with no parent-Planet system yet owned by that
  empire renders as an unattached minor body — visually smaller, no
  star of its own — matching its mechanical status as the lesser tier
  in §3. This makes the Planet/Outpost distinction legible at a glance
  in the galaxy view without reading any tooltip.
- This requires one addition to §11's architecture: the galactic Empire
  record needs a lightweight spatial assignment (which Sector belongs to
  which system, and orbital slot indices for Outposts attached to a
  Planet's system) alongside the ownership/specialization data already
  specified. This is presentation-layer bookkeeping, not new game logic
  — it can be a static or procedurally-seeded map layout, not something
  that needs to be simulated.

### 16.4 What this does and doesn't require to build

In line with the phased build order in §12, the visual layer should
also phase in rather than block v0:

- **v0:** a static galaxy-view map (dots for Sectors, colored by owner)
  is enough to make Planet/Outpost/Stipend claims (§3) visible at all —
  this alone clears most of 15.1(1)'s gap for minimal build cost.
- **v1:** system-view zoom for the player's own held Planet(s), with
  Stability rendered as a visible property of the body (16.2 point 1),
  and the neighborhood view showing Senate-relevant context (who's
  being Sanctioned/Contested) so a Senate vote has a place to look while
  deciding, not just a ballot text.
- **v2:** full four-level zoom with animated Fleet travel between
  systems (16.2 point 3), moons-as-Outposts (16.3), and the galaxy-wide
  saturation/Convergence framing (16.2 point 4, 15.2's decay-pressure
  gap). This is the right point to add it, since it's exactly when
  Fleets/raids/Blocs — the systems that most benefit from being watched,
  not just logged — come online.
- **Explicitly not required:** real orbital-mechanics simulation of
  planetary motion, a navigable 3D flight model between systems, or
  procedural planet generation beyond a handful of specialization skins.
  The reference screenshots are a *presentation* target (a zoomable,
  legible space with real depth), not a simulation target — matching
  the same "grounded but not a build screen" restraint §6 already
  applies to Fleets. A slowly-orbiting sprite and a parallax star field
  sell the effect at a fraction of the cost of a real physics sim.

### 16.5 Closing the "gains are invisible" gap from §15.1(5)

The galaxy view (16.2 point 4) is also the natural staging ground for
the spectacle §15.1(5) flags as missing: a newly claimed Planet, a
completed Wonder, or a won Contest vote can trigger a brief animated
beat on the galaxy map — a new light appearing, a Wonder's effect radius
flaring visibly around its owner's system — visible to anyone looking
at the map at that moment, the positive-side mirror of the battle log's
(§7) negative-side visibility. This is presentation only (no new
mechanic), and it's what turns "I won a Sector campaign" into something
the rest of the galaxy notices, not just something the winner's own
Empire record quietly updates.
