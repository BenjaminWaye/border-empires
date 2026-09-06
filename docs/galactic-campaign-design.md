# Galactic Campaign — Design Doc (draft)

Status: **partly shipped, mostly concept.** §1–14 came out of a design
discussion, not a build plan; the point of those sections is the shape of the
systems and how they connect. A first-pass set of balance numbers lives in §13
— internally consistent and checked against each other, but not playtested;
treat them as a starting point for tuning, not as settled constants.

**What already exists in this repo** (found while reviewing, and worth knowing
before anyone re-plans v0 — see §12 for how it maps onto the build order):

| Shipped today | Where |
|---|---|
| Durable cross-season planet record, keyed by `authUid`, surviving season rollover | `apps/realtime-gateway/src/galaxy-planet-store/`, `sqlite-galaxy-planet-store.ts` |
| One-time, permanent planet christening (name your won world) | `galaxy-routes.ts` → `POST /hq/galaxy/planets/:seasonId/name`, `galaxy-name-policy/` |
| Public + personal galaxy listings | `GET /hq/galaxy`, `GET /hq/galaxy/me` |
| Client galaxy view: starfield, rotating planet figure, christening flow | `packages/client/src/client-galaxy-view/` |
| "Emperor" = winner of the most recently ended season, with a 1-hour Imperial Ward endorsement window | `galaxy-endorsement-routes/`, `galaxy-endorsement-store/`, `client-imperial-ward/` |
| Full weekly Cycle tick (§9/§14/§13's trickle table, Influence upkeep, and the §7 deficit-drains-lowest-Stability-territory / healthy-empire-recovers-all rule), wired live in the gateway | `galaxy-economy-store/`, `galaxy-cycle-tick/`, `galaxy-cycle-scheduler/`, `galaxy-economy-wiring/` |
| Space View: a navigable 3D galaxy screen, gated on owning a Planet | `packages/client/src/client-space-view/` |
| Senate v1: EMBARGO and CONTEST proposals, Dominion-weighted voting (§13/§19.7), quorum/distinct-voter resolution on the same global Cycle clock, per-target cooldowns. EMBARGO halves trickle for its duration; CONTEST forces the named territory's Stability to 0 and enqueues it for a Defense Campaign | `galaxy-senate-store/`, `galaxy-senate-tick/`, `galaxy-senate-scheduler/`, `galaxy-senate-routes/`, `galaxy-dominion-weight/` |
| Defense Campaign season spin-up (§7/§11): a fully automatic single-stream scheduler folded into the existing natural-rollover hook — every 3rd slot is reserved Frontier, otherwise the oldest CONTESTed territory is popped off the queue and threaded through as inert metadata (`defenseCampaignTargetSeasonId`) via the gRPC gateway↔sim boundary into the new season. On that Defense Campaign season ending, ownership transfers to its winner via a new override table (`galaxy-defense-campaign-store/`), read ahead of the territory's original winner everywhere ownership is resolved. Planet naming rights are deliberately **not** transfer-aware — they stay with the original winner | `galaxy-defense-campaign-store/`, `galaxy-defense-campaign-store-factory/`, `galaxy-endorsement-auto-start/`, `galaxy-holdings/` |
| Client Senate UI: a panel inside Space View to list proposals, vote, and raise EMBARGO/CONTEST against a held territory | `packages/client/src/client-senate-panel/` |
| Fleets v1 backend (§6/§12 v2a), no client UI yet: the §6 hull table (Scout/Raider/Battleline/Dreadnought/Tanker) as pure budget/damage/travel-time config, save/list/delete blueprints, send a fleet (Production-costed, travel time derived from the composition's slowest hull against a fixed base since no real spatial/distance model exists), automatic raid resolution against the target's Stability net of its standing Garrison (§13's formula), a public battle log, and an endpoint to invest Production into a territory's Garrison. Exploration/fog-of-war (§17) is deliberately deferred — raids resolve against a named `targetSeasonId` the sender already knows about from the public galaxy listing, without needing a fog-of-war layer to exist first | `galaxy-fleet-config/`, `galaxy-fleet-store/`, `galaxy-fleet-tick/`, `galaxy-fleet-scheduler/`, `galaxy-fleet-routes/`, `galaxy-battle-log-store/`, `galaxy-fleet-wiring/` |

So the persistent-record half of v0 (§12) is real, and the season→galaxy
identity bridge (per-season `playerId` → durable `authUid`, via the auth
binding store) is already solved — which was the single riskiest piece of
§11. The Cycle economy engine (Influence/Production/Stability) and a first
slice of the Senate (EMBARGO, CONTEST) are also real and running, per the
table above — this correction replaces an earlier revision of this doc that
claimed none of that existed. Defense Campaign season spin-up is also now
real and running (a CONTESTed territory's Stability-zero now has an actual
automatic consequence — see the table above), the Senate has a client UI to
drive it, and Fleets v1 (§6/§12 v2a) now exists as a working backend: send a
fleet, wait out its travel time, and it automatically raids the target's
Stability net of Garrison, posting to a public battle log — the "raid" half
of §7's three ways to zero a territory's Stability is real now, not just
Influence deficit and Senate CONTEST. What still does *not* exist: the
other three Sanctions (Weapons Inspection, Blockade, Travel Ban, War
Reparations — Weapons Inspection and Blockade could now be built against
real Fleets, but weren't in this pass), the Terrain vote, exploration/fog-
of-war (§17 — deliberately deferred out of the Fleets v1 slice; see the
table above), Blocs, system development, or a navigable multi-level map
(Space View is a flat single-level galaxy view for now). Fleets v1 also has
no client UI yet — sending a fleet, watching it travel, and reading the
battle log are all backend-only (`POST /hq/galaxy/fleets/*`,
`GET /hq/galaxy/fleets/log`) for now.

**The shipped Emperor is phase one of the win condition, not a name clash.**
An earlier revision of this doc treated the shipped per-season "Emperor" as a
collision to rename around. That was wrong and §19.2 supersedes it: the
season-winner Emperor is the *bootstrap* form of a single title that becomes
Senate-elected once the galaxy is developed enough, and whoever holds it when
the last Sector is captured wins the galactic game. The shipped Imperial Ward
endorsement becomes the bootstrap-era Emperor's power. No rename needed.

This revision folds in PR #1264 verbatim as §1–14 (with corrections to §7 and
§9, marked inline), adds a review pass and visual-presentation spec (§15–16),
and then adds the three systems that review exposed as missing: exploration
and fog of war (§17), system development (§18), and the throne, the endgame,
and the permanent record (§19).

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
6. The galaxy runs until the **last unclaimed Sector is captured**, which
   triggers Convergence: whoever holds the Emperor's throne at that moment
   wins the galactic game, the era is recorded, and the galaxy resets
   (§9, §19).

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

**Correction to the original draft: there is no incumbent bonus.** An
earlier version gave the former owner a starting bonus scaled to their
sunk Garrison Production. That is cut. A Defense Campaign is *just a
season played on that Sector, and whoever wins it wins the planet* —
the former owner enters as an ordinary entrant with no advantage, or
doesn't enter at all. Three reasons this is the better design:

- **It's the one starting-position bonus that rewards incumbency
  itself.** This needs stating carefully, because the Wonder roster (§5)
  *does* grant in-season starting bonuses — Dyson Array gives starting
  manpower regen, Deep Sensor Array gives starting vision — and §4
  explicitly permits the galactic layer to touch "starting position".
  So the objection can't be "meta-layer bonuses shouldn't affect a
  season"; that boundary is already drawn elsewhere and drawn
  deliberately.

  The distinction is *what earns the bonus*. A Wonder bonus is bought
  with Production, available to any empire willing to spend 700 Prod on
  it, and applies to whatever campaign its owner enters next — it
  rewards investment, and anyone can invest. An incumbent bonus is
  granted **for already owning the specific thing being fought over**.
  That is the definitional snowball pattern: the advantage accrues to
  whoever is ahead, in the exact contest that decides whether they stay
  ahead. Every other mechanic in this doc — the upkeep curve, Bloc
  Sprawl Upkeep, open-to-anyone Defense Campaigns, developments
  transferring to the captor (§18.4) — exists to prevent precisely that,
  and an incumbent bonus would have been the one place the doc quietly
  did the opposite.
- **It removes the entrant-deterrence problem outright.** §15.2 flagged
  that a bonus-boosted Dominant-tier incumbent could make contesting a
  rich Sector a rationally bad bet, leaving Defense Campaigns empty. No
  bonus, no deterrence: an open Sector is worth exactly what's on it,
  and the strongest empires' best holdings become the *most* attractive
  targets rather than the least.
- **It collapses two campaign types into one.** With no incumbent head
  start, a Defense Campaign is structurally identical to a Frontier
  campaign in every respect — same matchmaking, same rules, same
  win conditions. The only difference is what the prize already has
  attached to it (a name, a history, and possibly developments — §18).
  That is a pure content difference, not a systems difference: one
  campaign type, no bespoke lobby, nothing extra to build.

The knock-on worth stating plainly: **Garrison Production is spent, not
stored.** It buys delay and deterrence (it raises the damage needed to
break the Sector, §13) and nothing else — if the Sector falls anyway,
that Production is simply gone. Garrison is insurance with no surrender
value, which is a real cost and should read as one when a player decides
between a Garrison, a Wonder, and a fleet.

Open-to-anyone also sharpens the anti-snowball intent: a large empire
that slips into deficit or eats a raid can lose the Planet to a rival
who never fired a shot, so weakness draws a crowd.

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
- No hard calendar reset. **Convergence** (the era-end event: the crown
  is settled, the Hall-of-Fame record is written using the existing
  cosmetics/history persistence, then the galaxy resets) triggers when
  **the last unclaimed Sector is captured** — every Sector in the galaxy
  held at once — rather than on a fixed date. This is robust to season
  cadence changing as the playerbase grows or shrinks; a fixed 365-day
  countdown isn't.

  **Superseded:** an earlier draft triggered Convergence on "≥90% of
  Sectors claimed *and broadly stable*". The stability half of that
  condition is cut. It was unmeasurable in practice, it fought §13's
  upkeep curve (which deliberately keeps large empires near break-even,
  so "broadly stable" may never arrive), and it gave players nothing
  concrete to watch. "Sectors remaining: 3" is a countdown anyone can
  read at a glance from the galaxy view, and it is the thing §19 hangs
  the entire endgame on.

  Note this count can go *down* as well as up — a Sector whose Stability
  breaks reopens and is unclaimed again (§7). That is not a flaw; §19.6
  turns it into the endgame's central tension.

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

  **Status: roughly half of this already ships** (see the table at the
  top of this doc). The durable per-account planet record, the
  season→galaxy identity bridge, christening, the public/personal galaxy
  listings, and a starfield galaxy view all exist. What v0 still needs is
  the Outpost/Stipend tiers, specialization mapping, and the beginnings
  of a Production balance. Anyone planning v0 should start from
  `galaxy-planet-store` and extend, not from scratch.
- **v1** — Influence, upkeep, Stability, Senate's three actions. This is
  where contestation and the anti-snowball pressure come online.
  **System development (§18) belongs here too**, not later: it depends
  only on Production and Influence upkeep, it's the cheapest way to give
  the map something to look at that changes over time, and it's what
  gives players who aren't winning seasons a reason to keep opening the
  layer at all.
- **v2a** — Fleets and raids (needs Stability from v1), plus
  **exploration and fog of war (§17)**, which shares the Scout hull and
  makes raid target selection a real decision.
- **v2b** — Alliance Blocs. Split out from v2 explicitly, because Blocs
  need raids to already exist to matter (§15.2); shipping v2a without
  v2b is a valid stopping point, not a half-finished phase.
- **v3** — the elective throne, Convergence, and the era record (§19).
  Last by necessity: vote weight is computed from everything the earlier
  phases build (§19.7), so it can't be specified until they exist.

  Three caveats on sequencing, because §19 is less "a final phase" than
  it looks:

  - **The bootstrap Emperor already ships.** §19.2's phase one is live
    today. So the title exists from v0 onward and only its *selection
    method* is a v3 change — which means v3 is extending a feature
    players already know, not introducing a win condition from nowhere.
  - **The era record store should be built early**, with v1. The risk in
    §19.8 isn't the scoring, it's writing the record before a reset
    wipes the galaxy — and that ordering is far easier to get right when
    the reset path is first written than retrofitted afterward.
  - **Succession tracking must exist before the first elective era
    runs**, not at Convergence. §19.8's `succession` log is append-as-it-
    happens; it cannot be reconstructed from a wiped galaxy.

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

### Exploration (§17)

| Source | Charting radius |
|---|---:|
| Held Planet (passive) | 2 systems |
| Held Outpost (passive) | 1 system |
| Listening Post development | +1 to its own system |
| Deep Sensor Array Wonder | +2, galaxy-wide for the owner |
| Scout mission | 1 along its path, 2 at destination; destination is also **Surveyed** |

**Derelicts:** ~8% chance per *newly charted, unclaimed* system. Payout
15 Inf, 40 Prod, or a random fleet blueprint. Deliberately low enough
that scouting is never a Production strategy — it's a garnish on a thing
you were doing anyway.

### System development (§18)

| Development | Body | Cost | Yield | Inf upkeep |
|---|---|---:|---|---:|
| Gas Harvester | Gas Giant | 80 Prod | +8 Prod/Cycle | 1 |
| Mining Station | Asteroid Belt | 50 Prod | +5 Prod/Cycle | 1 |
| Cryo Refinery | Ice Moon | 70 Prod | +6 Stability/Cycle, this system only | 1 |
| Listening Post | Barren Rock | 40 Prod | +1 charting radius, this system | 0 |

Systems carry 2–5 secondary bodies, fixed at galaxy generation.

Payback on both Production developments is **10 Cycles** — long enough to
read as a permanent commitment rather than a no-brainer, short enough to
be worth it for an empire that expects to hold the system. A fully
developed 4-body system runs roughly 240 Prod for about +13 Prod/Cycle
and 4 Inf/Cycle upkeep: a bit under half a Planet's Production for a bit
more than a Planet's Influence cost. Tall is intended to be *safe and
weaker*, not competitive with winning campaigns — Planets also carry
Senate weight and Wonder eligibility, which no development does.

**These paybacks are the numbers most sensitive to Cycle length**, which
§9 leaves at "proposed: monthly" — see §14.

### Dominion Score → Senate vote weight (§19.7)

| Term | Weight |
|---|---:|
| Planet held | 10 each |
| Outpost held | 3 each |
| Development completed | 2 each |
| Wonder held | 15 each |
| Stability | total across holdings ÷ 100 |

Worked comparison, to show the weights let both strategies contend for
the throne:

- **Wide:** 6 Planets, 2 Outposts, no developments, no Wonders, ~60
  average Stability → 60 + 6 + 0 + 0 + 4.8 = **70.8**
- **Tall:** 3 Planets, 1 Outpost, 10 developments, 1 Wonder, ~95 average
  Stability → 30 + 3 + 20 + 15 + 3.8 = **71.8**

Landing within a point of each other is the intent, not a coincidence:
an empire that won half as many seasons but built and held carefully
should carry comparable political weight to one that sprawled. Retune the
development and Wonder weights together if playtesting collapses that.

### The throne (§19)

**Elective transition** (§19.3), both required:

- ≥ 10 Sectors claimed in the galaxy
- ≥ 5 distinct Planet-holding empires eligible to vote

**Election** (§19.4):

| Rule | Value |
|---|---|
| Emperor | Plurality of pledged vote weight, tallied each Cycle |
| Vacancy threshold | Leader below 33% of total weight → throne vacant |
| Coalition benefit | Empires pledged to the sitting Emperor pay 33% less on Senate proposals |
| Pledge changes | Free, standing, take effect at the next Cycle tick |

**Crown Upkeep** (§19.5) — the anti-entrenchment brake, and the reason
the throne shifts on its own:

| Consecutive Cycles held | Influence upkeep per Cycle |
|---:|---:|
| 1–2 | 8 |
| 3–5 | 14 |
| 6+ | 22 |

For scale: a healthy 2-Planet empire nets about +2 Inf/Cycle (see the
worked examples above), and even a well-built Capital/Trade empire is in
the low tens. So the crown is *never* comfortably affordable — it is paid
for out of coalition support and accumulated reserves, and an Emperor who
holds it for six Cycles straight is burning 22 Inf/Cycle to do so. That
escalation is what makes long reigns a deliberate sacrifice rather than a
default state, and it is the number to tune first if the throne turns out
to be either too sticky or too frantic.

The Emperor's income bonus is **zero**, by rule and not by tuning (§19.5).

### Era length (§19.9)

- **Primary trigger:** the last unclaimed Sector is captured (§9).
- **Ceiling:** 40 Cycles, whichever comes first. Structurally required,
  not just a safety valve: §19.6 gives the opposition a standing
  incentive to keep one Sector permanently unclaimed, and the ceiling is
  what stops that from working.

## 14. Open questions before implementation

- **The numbers in §13 have not been playtested.** They are internally
  consistent — trickle, upkeep, raid costs, and Wonder prices were
  checked against each other — but internal consistency is not balance.
- **Defense Campaign entry conditions in practice:** §7 settles that
  they're open to anyone and (as corrected) that the former owner gets no
  advantage, but not the minimum viable entrant count. See the revised
  §15.2 bullet and the dormant-and-requeue proposal there.
- ~~**Convergence reachability.**~~ **Resolved.** The "broadly stable"
  half of the old saturation trigger is cut (§9); closure is now the
  concrete "last Sector captured", with a Cycle ceiling (§19.9) as the
  guaranteed backstop.
- **Blueprint sharing scope** (§6): Bloc-wide only, or galaxy-wide
  publishing? The latter is a real community feature but also a
  homogenizing force on fleet composition.

Added by the §15–19 review pass:

- **Cycle length is unresolved and everything depends on it.** §9 proposes
  monthly Cycles while observed seasons run about a week. At monthly, a
  player who wins a Sector waits a month for a first trickle, a Battleline
  is 8 months of one Planet's output, and §18's 10-Cycle development
  payback is the better part of a year — all of which fight the
  "check in a few times a week and see something changed" loop §16.6 is
  built on. A **weekly Cycle**, roughly tracking season cadence, fits the
  return loop far better while keeping §9's decoupling principle intact
  (Cycles tick on a clock, not on season completions). This needs
  deciding before §13's economy is tuned, because it rescales every
  per-Cycle number in the doc at once.
- ~~**Naming: "Emperor" collides with shipped code."**~~ **Resolved** by
  §19.2 — the shipped per-season Emperor is the bootstrap phase of the
  same title, not a separate honour. No rename needed, and the shipped
  Imperial Ward endorsement becomes that phase's power.
- **Do Outposts count toward Frontier tiering the same as Planets?** §10
  buckets empires by "Planet/Outpost count and Stability", but §18 now
  gives held systems a second growth axis. An empire with one Planet and
  twelve developments is materially strong and might still sit in a
  low tier, getting priority Frontier access it arguably shouldn't.
  Dominion Score (§13) may be the better tiering input than raw counts.
- **Minimum entrants for a Defense Campaign** (§15.2's revised bullet):
  the dormant-and-requeue fallback needs an actual number, and a rule for
  what happens to a system that stays dormant for many slots in a thin
  playerbase.
- **Are pledges public?** Recommend yes — visible coalitions are what
  make the throne a political drama rather than a hidden calculation,
  and they let a player see who to court. Secret pledges would add
  intrigue at the cost of making the single most important number in
  the game unreadable. Not settled here because it's a real trade-off.
- **How does a Bloc decide its pledge?** §8 gives Blocs a shared
  treasury and single weighted vote, but no internal governance model.
  With the throne at stake, "who decides where the Bloc's weight goes"
  becomes the most consequential unanswered question in §8 — leader's
  choice, internal majority, or unanimity are all defensible and
  produce very different politics.
- **What happens to the bootstrap Emperor at the transition?** §19.3
  makes the switch one-way but doesn't say whether the sitting
  season-winner Emperor keeps the throne into the first elective tally
  or the throne simply vacates and is re-decided. The second is
  cleaner; the first is kinder to whoever just won a season.
- **Do developments survive Convergence?** §19 wipes the galaxy between
  eras. Developments transferring with a captured system (§18.4) is
  settled; whether anything at all persists across an *era* boundary is
  not. The anti-snowball logic in §19.4 argues strongly for a clean wipe
  with only cosmetics and the Hall of Fame carrying over — but it should
  be stated as a decision rather than assumed.

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
- **Defense Campaign minimum-entrant question — largely resolved by the
  §7 correction, but not entirely.** The original failure mode was that
  a bonus-boosted Dominant-tier incumbent would deter challengers,
  leaving a Sector uncontested. Removing the incumbent bonus (§7) kills
  that: an open Sector is now worth exactly what's on it, and §18's
  developments make a rich Sector actively *more* attractive, not less.
  What remains is the thin-playerbase case — a Defense Campaign opening
  when almost nobody is queued. That needs a floor rule, and the
  cheapest one that doesn't reintroduce incumbency: if fewer than the
  minimum entrants queue, the Sector stays **unowned and dormant**
  (trickle paused, per §11's limbo handling) and re-queues next slot,
  rather than reverting to the former owner. Nobody gets it back for
  free; it simply waits.
- ~~**Convergence reachability compounds with the upkeep curve.**~~
  **Resolved by the §9 correction.** The finding stands as originally
  written — "broadly stable" was fighting the same anti-snowball pressure
  the doc deliberately applies — and the fix was to delete that half of
  the trigger rather than tune around it. Closure is now "last Sector
  captured" (§9), which is unambiguous, visible to players as a
  countdown, and independent of the upkeep curve entirely.
- ~~**No anticipation before the end.**~~ **Resolved by §9 and §19.6.**
  "Sectors remaining: 3" on the galaxy view gives players a real
  countdown without a fixed date, and §19.6's endgame — the Emperor
  racing to close the map while everyone else knocks Sectors loose to
  keep it open — supplies escalating pressure that no timer could.
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
mechanically and forgettable experientially. The first fix isn't more
systems, it's giving the systems that already exist a map to live on —
which is what §16 is for.

Working through that map surfaced three genuine holes that §1–14 could
not have shown on their own, and §17–19 close them:

- **Nothing to discover.** A fully-visible galaxy makes zooming out a
  re-read rather than a discovery, and leaves the Scout hull with almost
  no reason to exist. → §17.
- **Nothing to do with a system you already hold.** Every Production sink
  in §1–14 concerns territory you don't have or might lose, so an empire
  that isn't currently winning seasons has nothing to spend a trickle on
  and no reason to open the layer. This is the hole most likely to lose
  the median player, who wins seasons rarely. → §18.
- **Nothing to ultimately win.** §9 ended the galaxy but never said what
  Convergence *awards*, so the entire slow layer had no terminal payoff
  and no permanent record of who came out on top. → §19, which resolves
  it into a contested throne rather than a final score: the Emperor at
  the moment the last Sector falls wins the era. That also turns
  Influence from a peripheral currency into the spine of the endgame,
  and gives the galaxy view a live "who is winning" readout it
  previously lacked.

With those closed, the layer has all four things §15.1 asks for: a place
to look at, something to discover, something to build, and something to
finally win — plus, in §18.4, a loop that ties them together instead of
leaving them as parallel features.

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
   the "Sectors remaining" countdown and the sitting Emperor (§19), and for
   the Bloc-territory clustering that makes an Alliance Bloc (§8)
   visually read as a bloc, not just a roster entry.

### 16.3 A held Planet's win *is* owning its solar system

Extending the reference screenshots' idea directly into the reward
model in §3: winning a Sector campaign shouldn't just grant a Planet as
a data record — it should grant the player **that Planet's system**,
i.e. the star, the Planet, and the orbital slot structure around it,
as their visible piece of the galaxy view. Concretely:

- A **Planet** (§3's top reward tier) claims the system: the star, the
  Planet's own orbital position, *and the system's secondary bodies* —
  the gas giants, belts, and moons that §18 turns into a development
  track. This gives multi-Sector empires an actual *shape* — "my empire
  is these three systems, and look how built-up the second one is" —
  rather than a flat inventory count.
- An **Outpost** renders as a minor body **in the system of the Sector
  it was won in**, not relocated into the owner's home system —
  visually smaller, no star of its own, matching its mechanical status
  as the lesser tier in §3. So a galaxy view shows empires as scattered
  presences, not tidy self-contained blobs, and a system can hold a
  rival's Outpost alongside your Planet — a permanent friction point
  and a natural raid target.

  **Correction to an earlier draft of this section:** it modeled
  Outposts as moons orbiting the owner's Planet. That is superseded —
  moons and other secondary bodies are *developments* (§18), earned by
  spending Production in a system you already hold, never by winning a
  separate campaign. Keeping the two straight matters: Outposts come
  from campaigns and are scattered; developments come from Production
  and are concentrated in systems you own.
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
  closure/Convergence framing (16.2 point 4, 15.2's decay-pressure
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

### 16.6 What a session actually looks like

The sections above describe systems and a camera. This one describes the
two minutes a player actually spends, because that's the thing the whole
layer has to earn — and it's the check every future addition should be
held against.

**Target session: 1–3 minutes, a few times a week, between seasons.**
Closer to checking a Clash of Clans base than playing a second game. If a
proposed feature can't fit in that window, it belongs in the season, not
here.

1. **You open on your own system, not a menu.** Camera at system view
   (§16.2 level 2): your Planet, its Stability ring, its developments
   (§18), any moons and belts still undeveloped, drifting slowly against
   the starfield. This is the home screen. There is nothing to configure
   — it's a place, and that's the point (§15.1).
2. **You read what changed since last time, from the picture alone.**
   This is the actual job of the view, and the reason it beats a
   dashboard. Without opening anything: a line arcing in from off-screen
   is an inbound fleet with its ETA (§6's telegraph, made visible); a
   dimmed or flickering neighbor is a Sector currently running a
   campaign; a flare is a Wonder completed or lost (§16.5); your own
   Stability ring sitting lower than you left it is a Cycle of deficit
   you didn't notice; a newly-lit system at the edge of your vision is a
   Scout mission that finished (§17).
3. **You do at most one thing.** Most visits should have exactly one
   obvious action, or none:
   - Commit banked Production — toward a Wonder, a development on a body
     in your own system (§18), a Garrison, or a fleet from a saved
     blueprint (§6).
   - Cast a Senate vote if one's open — as an overlay while sitting in
     the galaxy view, with the target system highlighted, so "Sanction
     empire X" is a place you can see rather than a name in a list.
   - Send a Scout at unmapped space (§17).
   - Adjust your standing defense posture (§6) — one control on your own
     Planet.
4. **You leave.** The most common correct session is: look, see nothing
   is on fire, close it. A meta-layer that *requires* action every visit
   has become a chore; one that *rewards* an occasional action is a
   habit. The trickle economy (§4, §5) is built for exactly this — it
   accrues whether you show up or not, and showing up is about deciding
   where it goes.

**Zooming out is optional, not a step.** Neighborhood view (§16.2 level
3) is for checking on rivals and contested Sectors; galaxy view (level 4)
is for browsing, scouting targets, watching Bloc territory as clusters of
colour, and reading the "Sectors remaining" counter and current Emperor,
which together say how close the era is to ending and who is winning it
(§19). None of it is on the critical path of a routine visit.

## 17. Exploration and fog of war

### 17.1 Why the galaxy shouldn't start visible

§16 gives the layer a place to look at, but as specified there the whole
galaxy is legible from day one — which quietly undercuts the return hook
§16.6 is built on. If the map is fully known, zooming out is re-reading a
board you've already read. If it isn't, zooming out is *discovery*, and a
system appearing where there was nothing is the same class of event as an
inbound fleet or a Wonder flare: something changed, and you found it by
looking.

It also fixes a smaller problem. The Scout hull (§6) currently has
exactly one job — peek at a raid target's Garrison — which is not enough
to justify a hull class, and which nobody without an active raid plan
will ever build. Exploration gives the cheapest ship in the game a
permanent reason to exist, and gives new or Emerging-tier empires (§10)
something worth doing with a trivial amount of Production.

### 17.2 What's hidden and what isn't

Fog here is a **rendering and intel gate, not a simulation gate** — the
galaxy is fully simulated at all times; you're just not shown it. That
keeps this cheap: no per-empire world state, only a per-empire set of
revealed system ids.

Three visibility states per system, from an individual empire's view:

| State | What you see |
|---|---|
| **Unknown** | A star in the backdrop, nothing more. No owner, no contents, not selectable. It's scenery. |
| **Charted** | The system exists, its star and body layout are known (how many gas giants, belts, moons), and it's selectable and zoomable. Ownership and specialization are shown live. |
| **Surveyed** | Everything in Charted, plus a **timestamped intel snapshot**: Garrison strength, Stability, and developments *as of when you last looked*. |

The Charted/Surveyed split is what makes repeat scouting worthwhile
without creating a chore. **The map is permanent; the intel is a
snapshot.** Once charted, a system never goes dark again — there is no
decay to babysit, no re-scouting to keep a map you already earned. But
the *numbers* attached to it are stamped with a date, and the client
should show them as such ("Garrison 180 — 4 Cycles ago"). Old intel isn't
hidden or wrong, it's just old, and acting on stale numbers is the
player's call. That's a real decision (raid on three-Cycle-old intel, or
spend 25 Prod refreshing it first?) with no upkeep burden attached.

### 17.3 How space gets revealed

Three sources, all reusing things that already exist in the doc:

- **Passive vision from holdings.** Every Planet charts systems within a
  small radius of itself; Outposts chart a smaller one. So winning
  campaigns expands the map on its own, and an empire that never builds a
  Scout still sees its own neighbourhood grow.
- **Scout missions.** Send a Scout at any point in space, charted or not;
  it travels there over its (fast) travel time and permanently charts
  everything within a radius of its path and destination, then returns.
  This is the deliberate exploration tool, and at 25 Prod it's the
  cheapest thing in the game.
- **Deep Sensor Array** (§5's existing Wonder) extends passive vision
  radius galaxy-wide for its owner, instead of only affecting their next
  season's starting vision. That gives an already-specified Wonder a
  second, permanent use and makes it a real competitor to the military
  Wonders rather than a season-scoped nicety.

**Blocs share charts.** A Bloc pools its members' charted map — a
genuinely valuable, zero-balance-risk Bloc benefit (§8) that makes
joining one immediately useful rather than only paying off once raids
exist. Surveyed *intel* pools too, with each entry keeping the timestamp
of whoever actually looked.

### 17.4 What exploring gets you beyond the map

Charting is only worth doing if what you find changes decisions:

- **Target selection.** §18 makes systems genuinely unequal — a Sector
  with three gas giants and a built-up rival is a far richer prize than a
  bare rock. You cannot tell those apart without charting them, so
  scouting is how you decide which Defense Campaign to enter, which
  Sector to raid, and which to Contest in the Senate. This is the loop
  that ties the three new systems together, and it's the main argument
  for fog of war being worth building at all:

  **explore → find a rich system → raid or Contest it → win the
  resulting campaign → inherit its developments (§18.4).**

- **Frontier lobbying.** Charting an unclaimed Sector before it opens
  tells you whether it's worth queueing for, and gives the Senate's
  next-Sector terrain vote (§4) something concrete to argue about beyond
  map archetype.
- **Derelicts.** Rare, one-time finds in charted-but-unclaimed space: a
  small Influence/Production lump, or a fleet blueprint. Deliberately no
  combat, no skill check, no decision — you scouted, you found something,
  it's yours. Keeping them decision-free is what keeps them inside the
  low-agency register (§1) instead of turning exploration into a
  minigame. Rates in §13.

### 17.5 What this deliberately isn't

- **No stealth or counter-intel systems.** §6 grounds detection in
  radiator signatures, which is good flavour and a bad system — hiding
  fleets from a defender directly attacks the "full information, no
  ambush" fairness principle §6 and §16.6 both depend on. Signatures stay
  descriptive.
- **No vision decay.** Stated above, worth repeating as a rule: charted
  is permanent. Every design that makes players re-do work to stand still
  is a chore in a layer that gets 2 minutes a visit.
- **No exploration-only resource.** Derelicts pay out in the two
  currencies that already exist. A third currency earned only by
  exploring would need its own sinks, its own balance pass, and its own
  UI, for a system that's meant to be a garnish on the map.

## 18. System development

### 18.1 The gap this fills: there is no "tall" play

As §1–16 stand, Production has three sinks — Fleets, Garrisons, Wonders —
and *all three are about territory you don't have yet or might lose*.
There is nothing to do with a system you already own except defend it.
That leaves the doc with a single strategy axis: expand wide, hold, or
lose. And §13's upkeep curve deliberately punishes going wide, which
means the game's one available strategy is also the one it taxes hardest.

That's a real design hole, and it lands worst on exactly the players who
can least afford it: seasons are scarce, most players won't win one
often, and an empire holding one or two Planets currently has almost
nothing to spend a slow trickle on. Wonders are 350–700 Prod away.

**Development is the "tall" axis.** Every system contains secondary
bodies — gas giants, asteroid belts, ice moons, barren rocks — fixed at
galaxy generation and visible in system view (§16.2) as empty orbital
slots. Spending Production develops them, permanently, without winning
anything. Your systems visibly fill in over time.

This is also what makes the system view worth returning to. A view of one
planet you already won is a trophy case; a view of a system you are
slowly building out is a base — and base-building is the single most
reliable return hook in the reference class (§15.1).

### 18.2 The development roster

Four, mapped to body types, each doing something the existing systems
already care about rather than introducing new levers:

| Body | Development | Effect |
|---|---|---|
| **Gas Giant** | Gas Harvester | Permanent Production trickle add to the owning empire |
| **Asteroid Belt** | Mining Station | Smaller permanent Production trickle |
| **Ice Moon** | Cryo Refinery | Permanent Stability regeneration for *this system only* |
| **Barren Rock** | Listening Post | Extends this system's passive charting radius (§17.3) |

Costs, yields, and upkeep are in §13. Deliberately kept to four, with no
tech tree, no upgrade tiers, and no adjacency rules — a development is
one click, once, and then it's done forever. The interaction weight has
to stay at §16.6's "at most one thing per visit".

### 18.3 The brake: development is not free growth

A permanent, compounding Production trickle is a snowball engine, and
this doc's whole thesis is anti-snowball. Two things hold it in check,
both reusing levers already in the design rather than inventing a new
one:

- **Each development costs Influence upkeep** (§13), drawn every Cycle
  exactly like Planet upkeep (§4). So building tall pushes an empire
  toward the same deficit pressure as spreading wide — same mechanic,
  same failure mode, nothing new for a player to learn.
- **Development is hard-capped by geography.** A system has the bodies it
  has, fixed at galaxy generation (typically 2–5). There is no way to add
  more, so an empire's total development ceiling is set by how many
  systems it holds — which is set by winning campaigns, which is the
  thing the whole game is about.

The intended shape of the choice, and the reason to add this at all:

| | Wide (more Planets) | Tall (more developments) |
|---|---|---|
| Gets you | More trickle, Senate weight, Wonder eligibility | More trickle only |
| Costs | Steep escalating Influence upkeep (3,3,3,4,5,6…) | Flat, small Influence upkeep per development |
| Requires | Winning campaigns — scarce, contested | Only Production and time |
| Risk | More Sectors exposed to raids/Contest votes | Concentrated: one lost Sector loses everything in it (§18.4) |

Tall is the slower, safer, always-available path; wide is faster, more
powerful, and far more precarious. That's a genuine strategic axis, and
crucially it gives the player who *hasn't* won a season lately something
real to do — which is the difference between a meta-layer that retains
casual players and one that only rewards the people already winning.

### 18.4 Developments transfer with the system

**If you lose the Sector, the new owner inherits everything built in
it.** Developments are not destroyed and not refunded — they change
hands intact.

This is the single most important rule in this section, because it's what
wires §17, §18, and §7 into one loop instead of three features:

- A developed system is a **visibly richer prize**, and §17's charting is
  how rivals find out. Building tall paints a target on you.
- It gives raids and Contest votes (§7) a motive beyond denial. Taking a
  built-up system is the fastest way to grow that doesn't require
  winning a Frontier campaign — which matters a lot for Established and
  Dominant empires, whose Frontier access is deliberately deprioritized
  (§10).
- It's anti-snowball without a special rule: the most developed empire is
  automatically the most attractive target, so success generates its own
  opposition. §7's "no leader carve-out" stays true — bigger empires are
  emergently more exposed, never singled out.
- And it gives losing a Sector real weight without making it
  unrecoverable, which is §15.1(4)'s bar: you lose a lot, someone else
  gains exactly what you lost, and the Defense Campaign that decides it
  is a fair fight nobody starts ahead in (§7).

The one thing this needs from the client is that inherited developments
stay legible as inherited — a captured system showing what it was and who
built it is the same "losses read as drama" principle as §7's battle log.

## 19. The Emperor, and how the galactic game is won

### 19.1 The win condition

**Whoever holds the Emperor's throne at the moment the last unclaimed
Sector is captured wins the galactic game.**

That single sentence does more work than the Dominion Score model an
earlier draft of this section proposed, and it replaces it as the win
condition (§19.7 explains what Dominion Score becomes instead). Three
reasons it's the stronger design:

- **The win condition is a *seat*, not a score.** A score is something
  you compute and show people; a throne is something people can see
  someone sitting in, want, and take. At any moment there is exactly one
  Emperor, named on the galaxy map, and everyone knows whether it's them.
- **It makes the Influence economy the spine of the game.** Influence
  currently buys Sanctions, Contest votes, and terrain votes — useful,
  but peripheral to anything final. Tying the throne to Senate backing
  makes every Influence decision in §4 a decision about the endgame.
- **It's inherently unstable, which is the point.** The crown shifts
  constantly (§19.4, §19.5), so nobody accumulates a decisive lead;
  what matters is who is holding it at one unpredictable moment.

### 19.2 The naming collision is not a collision — it's phase one

An earlier revision of this doc flagged that "Emperor" was already taken
in shipped code (`galaxy-endorsement-routes`: the winner of the most
recently ended season, holding a one-hour Imperial Ward endorsement
window) and proposed renaming one of the two titles.

**That was wrong, and this supersedes it.** The shipped behaviour is the
*bootstrap phase* of this exact title, not a different honour that
happens to share a name. There is one Emperor throughout, selected two
different ways depending on how developed the galaxy is:

| Phase | Emperor is | Runs while |
|---|---|---|
| **Bootstrap** | The winner of the most recently ended season *(shipped today)* | The galaxy is too small or too empty for a meaningful vote |
| **Elective** | Elected by the Senate, continuously (§19.4) | The galaxy has enough claimed Sectors and enough voters |

No rename is needed, and the shipped Imperial Ward endorsement becomes
the bootstrap-era Emperor's one power — which gives existing code a clean
place in the design rather than making it legacy to work around.

### 19.3 When the throne becomes elective

The transition fires the first Cycle tick where **both** hold:

- **At least 10 Sectors in the galaxy are claimed.** Below that there
  isn't enough held territory for Senate weight to mean anything.
- **At least 5 distinct Planet-holding empires are eligible to vote.**
  Below that an "election" is a handful of people, and one Bloc would
  simply own the throne outright. This is the same concern the ≥3
  distinct-voter floor in §4 exists to address, set higher because the
  stakes are the whole game.

The transition is **one-way within an era.** If the galaxy later drops
back below either threshold (players leave, Sectors reopen), the throne
stays elective rather than reverting to season-winner. Flipping selection
rules back and forth mid-era would be incomprehensible to players and
would hand a huge, arbitrary advantage to whoever happened to win the
season at the moment it flipped.

### 19.4 The election: standing pledges, not a ballot every Cycle

The throne is decided by **standing pledges**, recalculated each Cycle.
Not a discrete election event — a continuously-updating balance of
support, which is what makes it shift on its own as fortunes change.

- Every eligible empire has a **vote weight** (§19.7).
- Each empire **pledges** its weight to one candidate — itself, or
  another empire. A pledge is a standing setting: made once, it persists
  until changed. This matters for §16.6's session budget — backing
  someone is a decision you revisit when something changes, not a chore
  every Cycle.
- Blocs pledge as a single weighted entity (§8), so organizing
  translates directly into throne-making power.
- **Outpost-only empires can pledge**, with whatever weight their
  holdings give them. They don't count toward §19.3's five-empire
  threshold (that measures whether a real polity exists), but they are
  not disenfranchised. Excluding them would strip a vote from exactly
  the new and emerging players Outposts exist to onboard (§3, §10), and
  in a close race their pooled weight is worth courting — which is the
  best possible reason for an established empire to care about a
  newcomer.
- At each Cycle tick, pledges are tallied. **The plurality holder is the
  Emperor.** If the leader holds less than a third of total weight, the
  throne is **vacant** — nobody is Emperor until someone consolidates
  enough support.

**Why anyone pledges to someone else.** Without an incentive, everyone
self-pledges and the throne goes to whoever is simply biggest, which
would be both boring and a snowball. So: **empires pledged to the sitting
Emperor pay reduced Senate proposal costs** (the same lever Grand
Exchange already pulls in §5). Backing the winner puts you in the ruling
coalition and makes your own politics cheaper; holding out and building a
rival coalition costs you in the meantime. That's a real, recurring
choice between profit and ambition, and it's the engine of the whole
political layer.

**The crown itself is why coalitions break.** See §19.5.

### 19.5 Crown Upkeep: the throne must not entrench

This is the single most important balance rule in the section, and the
one most likely to be got wrong in implementation.

**The Emperor receives no Influence or Production income from the
throne.** Not a small amount — none. Influence is what decides the
throne, so any Influence the crown grants is the crown paying for itself,
and the whole design collapses into "first empire to get ahead stays
ahead forever" — the exact failure this doc's every other mechanic exists
to prevent.

Instead the crown **costs**:

**Crown Upkeep** — the sitting Emperor pays an Influence upkeep every
Cycle they hold the throne (rate in §13), on top of their normal Planet
and development upkeep (§4, §18). Wearing the crown is expensive, and it
gets more expensive the longer it's worn (§13 escalates it), so:

- An Emperor slowly bleeds Influence, which erodes their own vote weight,
  which eventually costs them the throne. The crown falls off on its own.
- Holding it continuously is a deliberate sacrifice: you are spending
  real economic capacity on prestige and political leverage.
- It reuses the upkeep lever players already understand from Planets,
  developments, and Bloc Sprawl — no new mechanic to learn, applied at
  one more level.

**If the Emperor cannot pay, they abdicate immediately** — the throne
vacates at that Cycle tick and pledges re-tally. Crown Upkeep does *not*
fall through into the normal Influence deficit path (§7), and this is a
deliberate exception to how every other upkeep in the doc behaves. Two
reasons: routing it through deficit would mean an over-reaching Emperor
punishes their own *Sectors'* Stability for a purely political
over-reach, which reads as arbitrary; and it would let an insolvent
empire keep the crown for several Cycles while slowly bleeding out, which
is exactly the entrenchment this rule exists to prevent. Abdication is
immediate, legible, and self-correcting.

This is what delivers "the Emperor constantly shifts". It is not a
random rotation or an artificial term limit — it's a throne that is
genuinely expensive to keep, in the currency that keeps it.

**What the Emperor does get**, all political, none economic:

| Power | Note |
|---|---|
| One free Senate action per Cycle (Sanction or Contest) | Reuses The Long Signal's token concept (§5) |
| Tie-break on any deadlocked Senate proposal | Pure authority, no income |
| Names the next era's galaxy if they win at Convergence | §19.8 — the prestige payoff |
| A visible crown on their system in the galaxy view | The spectacle (§16.5) |

Free Senate actions are leverage over *others*, which is worth fighting
for and does not compound into holding the throne longer. That's the
distinction to hold onto: **the Emperor gets more say, never more
means.**

### 19.6 The endgame: why the last Sector is the best part

Convergence fires when the last unclaimed Sector is captured (§9). Since
the claimed-Sector count moves both ways — a Sector whose Stability
breaks reopens as unclaimed (§7) — the endgame generates a genuinely
excellent dynamic with no extra machinery:

- **The sitting Emperor wants the galaxy to close now.** Every Cycle it
  stays open is another Crown Upkeep payment and another chance to be
  outvoted. They push to capture the last Sectors fast.
- **Everyone else wants to keep it open.** As long as one Sector stays
  unclaimed, there's still time to take the throne. So rivals raid and
  Contest to knock Sectors *loose* — deliberately destabilizing the
  galaxy to stop the music while they build a coalition.

That's a real, emergent endgame: a race between one player trying to
finish the map and everyone else trying to keep it unfinished, with the
crown changing hands while they fight over it. None of it needs a
bespoke endgame system — it falls straight out of the contestation rules
(§7) meeting the closure condition (§9).

**It also needs a stalemate guard**, because a determined opposition
could keep one Sector perpetually in play. §19.9's Cycle ceiling is that
guard, and under this model it stops being a nice-to-have safety valve
and becomes structurally required.

### 19.7 Vote weight, and what Dominion Score is now for

An earlier draft made **Dominion Score** the win condition. It isn't any
more — the throne is. But the score is not discarded, because the
weighting work it did is exactly what an election needs: a single number
expressing how much an empire materially matters.

**Dominion Score is now the basis of Senate vote weight.** Weights are
unchanged (§13): Planets, Outposts, developments, Wonders held, and total
Stability. That means:

- Every system in the doc feeds the endgame. Winning campaigns, building
  tall (§18), racing Wonders, and holding your territory *stable* all
  convert into political weight, and political weight is what wins.
- Holding things well matters as much as holding a lot — the Stability
  term means a sprawling, deficit-ridden empire has less say than a
  smaller, healthy one, which is consistent with §13's anti-sprawl
  intent rather than fighting it.
- It gives a clean, already-balanced answer to "how much is this empire's
  pledge worth" without inventing a second scoring system.

Dominion Score also remains the right input for the §10 progression
tiers, and it is recorded in the era standings (§19.8) as "who was
strongest" — a separate and interesting fact from "who was Emperor at the
end", and one worth preserving precisely because they will often differ.

### 19.8 Recording it: the era record

Unchanged in structure from the previous draft, with the fields adjusted
for a throne-based win. **A new append-only store, `galactic_era`** — one
row per completed era, alongside the existing `galaxy_planet` and
`season_archive` tables:

| Field | Notes |
|---|---|
| `eraId`, `eraSequence` | Primary key and human-facing "Era 3" number |
| `startedAt`, `convergedAt` | Era bounds |
| `triggerReason` | `final_sector_captured` or `cycle_ceiling` (§19.9) |
| `emperorAuthUid` | The winner — whoever held the throne at closure. Nullable: the throne can be vacant (§19.4) |
| `emperorDisplayName` | **Denormalized snapshot, not a join** |
| `finalSectorSeasonId` | The capture that ended the era — the record should be able to say which campaign closed the galaxy, and who won it |
| `crownedFor` | How many Cycles the winner held the throne, so a long reign and a last-second snatch read differently |
| `succession` | Frozen JSON: every Emperor of the era in order, with the Cycles they held. This is the era's story |
| `standings` | Frozen JSON: top N empires by Dominion Score — "who was strongest", distinct from who won |
| `dominantBlocName` | Nullable |
| `holdings` | Frozen JSON: who held which systems, **with christened planet names** |

The four persistence disciplines from the previous draft all still apply,
and one is now sharper:

1. **Denormalize display names at write time.** Never render the Hall of
   Fame by joining live account records; players rename and the record
   must not rewrite itself.
2. **Write before the reset, not after.** The galaxy reset is a
   wipe-and-replace, structurally identical to the season rollover hazard
   §11 already calls out, and the same bug is available here. An explicit
   "seal era" step, ordered ahead of the wipe.
3. **Append-only and immutable**, which also keeps the store trivially
   bounded — one row per era.
4. **Track succession as it happens, not at the end.** `succession`
   cannot be reconstructed after the fact from a wiped galaxy, so each
   change of Emperor must be appended to a running era log at the Cycle
   it occurs. This is the one piece of §19 that needs writing *during*
   the era rather than at Convergence, and it's easy to miss.

**If the throne is vacant at closure**, the crown goes to the plurality
pledge-holder even if they're below the one-third threshold, so an era
always has a winner. The record should note it was won from a vacant
throne — a legitimate and memorable way to take a galaxy.

Surfacing it: a `GET /hq/galaxy/eras` listing and an in-client Hall of
Fame reachable from the galaxy view (§16.2 level 4), alongside the
live "Sectors remaining" counter and the current Emperor.

### 19.9 Making sure an era can actually end

Under §19.6, a coordinated opposition has a standing incentive to keep
one Sector permanently unclaimed. So the ceiling is structural, not
optional:

**An era ends when the last Sector is captured, *or* at a hard Cycle
ceiling (§13), whichever comes first.** At the ceiling, the sitting
Emperor wins exactly as if the map had closed.

This guarantees the payoff always lands, and it has a useful second
effect: as the ceiling approaches, the incentives invert — the opposition
can no longer win by stalling, so they must either take the throne or
lose. A stalling endgame is forced back into action rather than allowed
to grind.

### 19.10 What the winner gets

**Cosmetic and commemorative only — no mechanical advantage carried into
the next era.** A persistent power carryover would make era 2 unwinnable
for everyone else and contradict every anti-snowball mechanic in this
doc.

- A permanent title and badge on the account, displayed in-season, using
  the cosmetics/history persistence §9 already assumes.
- A permanent Hall of Fame entry, by name, with the systems they held and
  what those systems were called.
- **Naming rights over the next era** — the winner names the incoming
  galaxy. Enormous in prestige, exactly zero in balance impact, and it
  already has a shipped precedent in this repo:
  `POST /hq/galaxy/planets/:seasonId/name` with its one-time, permanent,
  validated christening flow (`galaxy-name-policy`). Era naming is the
  same mechanic one level up and can reuse the same validation and the
  same "this cannot be changed later" framing.
