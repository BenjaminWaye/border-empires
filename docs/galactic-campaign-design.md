# Galactic Campaign — Design Doc (draft)

Status: **concept / not implemented.** This is the output of a design discussion,
not a build plan. Numbers throughout are placeholders for a later balance pass —
the point of this doc is the shape of the systems and how they connect, not the
constants.

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

**Upkeep:** every held Planet/Outpost costs a small Influence upkeep,
scaling with how much territory an empire holds (Stellaris admin-cap
logic). Spread wide without enough Trade/Capital income to back it, and
upkeep exceeds generation — that's an **Influence deficit**, one of the
three paths into contestation (§7).

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
  quorum stays meaningful as the playerbase grows or shrinks).
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

**Flag, not yet resolved:** Aegis Relay stacked with Bloc mutual defense
(§8) is the same anti-snowball risk called out there — a Bloc that holds
both becomes very hard to dislodge. Whatever brake Blocs get needs to
account for Aegis Relay too, not just treasury pooling.

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

Stability hitting zero opens a **Defense Campaign**: a Sector campaign
season scoped to the defender plus challenger(s), not the full
playerbase. Garrisons (Production), the defender's standing Defense
posture (§6), and Bloc mutual defense (§8) restore or protect Stability
before it breaks.

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

**Open risk, unresolved:** pooled treasury + mutual defense could make a
top Bloc progressively harder to raid or destabilize the larger it gets —
which undermines the exact anti-snowball effect Stability is there to
provide. If Blocs ship, they need their own brake (e.g. Influence upkeep
that scales with member count) so blobbing isn't free.

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

## 11. Architecture notes (from earlier discussion, unchanged)

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
  (needs raids to exist to matter, and needs its own anti-snowball brake
  designed before it ships — §8).

## 13. Open questions before implementation

- Actual numbers: upkeep rates, trickle rates, Stability thresholds, raid
  resolution formula, Outpost/Stipend scaling. None of this doc's numbers
  are load-bearing yet.
- Defense Campaign scoping: exactly who's eligible to join one (defender +
  raider only? Bloc members? anyone?).
- What happens to a Sector's yield during the gap between Stability
  hitting zero and the Defense Campaign season actually being scheduled,
  in a single-stream (no concurrency) launch.
- Bloc anti-snowball brake (§8) needs a concrete mechanism before v2 —
  and needs to cover Aegis Relay (§5), not just treasury pooling.
- Wonder supersession: what actually happens to an owner's standing
  effect the moment a rival out-produces and takes a Wonder from them —
  instant cutover, a grace period, partial refund of invested Production?
