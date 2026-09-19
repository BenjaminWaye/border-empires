# The Opening — Exploration Brief

> **Status:** Early exploration, NOT a committed design. Companion to
> `docs/expansion-motivation-exploration-brief.md`, which diagnosed why
> expansion stops mattering in the *mid* game. This one asks the earlier
> question: **is the first session interesting at all, and if not, what is
> structurally missing?**
>
> Every number below was read out of live source on 2026-09-19 (see §8 for
> the verification log and the stale figures it corrects). This repo's own
> docs are not guaranteed current — `README.md`'s economy section in
> particular predates the manpower rewrite and should not be cited.

---

## 1. The opening, reconstructed from code

What a brand-new player actually has at minute 0, in production
(`fly.combined.toml`):

| | |
|---|---|
| Territory | **1 tile**, carrying a SETTLEMENT-tier town, population 800 (`season-seed-world.ts:87-97`) |
| Manpower | **720**, at full cap, regen **0.4/min** (~30h to refill) (`config.ts:160-161`) |
| Gold | **10**, income ~**10/day** (`server-game-constants.ts:55`, `:58` ÷ `GOLD_RESCALE_DIVISOR`) |
| Vision | **radius 2** at the capital — base 1 plus every town's unconditional +1 (`runtime-town-vision.ts:25-29`), so a 5×5 of the 7×7 reach bubble |
| Reach | **radius 3** — a 7×7 you may claim into, 48 tiles (`config.ts:286`) |
| Tech | none researched; research is **instant**, and price escalates per tech owned: 10, 40, 70, 100, 130, 170… (`tech-economy.ts:21-28`) |
| Nearest rival | **≥50 tiles** (`season-seed-world-player-spawn.ts:85`) |
| Rivals in world | **5 AI** (`fly.combined.toml:67`) on 640×320 = 204,800 tiles |
| Nearest barbarian | **≥12 tiles**; only **30** barbarian tiles world-wide at seed (`season-barbarian-seed.ts:11-12`) |
| Combat | **hidden from the UI** until first contact with an enemy (`client-muster-tile-actions.ts:29`) |
| Guidance | a 4-item checklist: find a town → take it → find 4 food slots → take them (`client-onboarding-checklist.ts`) |

Available verbs: EXPAND (10 mp, 7.5s), SETTLE (20 mp, 60s, 3 concurrent),
build a RELAY_BEACON (30 mp, 60s, +5 reach / +5 vision), research one tech.
That is the entire opening action space. Note the beacon requires SETTLED
ground (`runtime-structure-command-handlers.ts:307`), so each reach hop is
expand + settle + build: 60 mp and ~2.1 minutes, placed on land you already
hold.

**Worked first session.** 720 manpower buys ~40 expands + 8 settles, or ~24
relay beacons. Reach-3 is only 48 tiles, so the starting bubble is claimed
out in roughly 6 minutes of clicking and ~16 minutes of settle timers. Reach
then has to be pushed outward by relay beacon, 5 tiles at a time. The spawn
algorithm guarantees a neutral town within 10 tiles (`:80`) and no closer
than `minTownSpacing` (5), so the first town is 5–10 tiles out: two beacon
hops, uncontested, for 30 manpower total. The starting settlement crosses
the 1,000-population TOWN threshold (`season-seed-world.ts:100`) on its own
in roughly 2.5 hours whether or not the player is logged in.

Nothing in that paragraph is a decision.

## 2. The five things a 4X opening is supposed to do, scored

An opening's job is to (a) give you an identity, (b) give you a plan, (c)
give you a threat, (d) give you a surprise, (e) give you a reason to log
back in. Border Empires' opening currently does (e), weakly, and nothing else.

### A. Identity — **missing entirely**

Every empire starts byte-identical: same single settlement, same 720
manpower, same 10 gold, same empty tech set. The only variance the world
grants is `townTypeAt` returning MARKET or FARMING
(`server-worldgen-towns.ts:39-45`), which the player neither chooses nor is
told about. There is no civ, faction, leader, doctrine, or starting bias.

The game *has* the plumbing for an asymmetric start — `pendingGalacticWonderBonus`
applies a manpower-regen and vision bonus at JoinSeason (`runtime.ts:1763`,
`config.ts:168-180`) — but it fires for exactly one player per season: the
previous season's Planet winner. The one player who least needs a head start
is the only one who gets a distinct opening.

**Consequence:** there is no "what am I this game?" moment, so there is
nothing to form a plan around and nothing to make season 2's opening feel
different from season 1's.

### B. A plan — **deferred out of the opening by the gold curve**

Tech **is** a real budget decision, and an earlier draft of this brief got
that wrong — see §8. The `cost.gold: 10` in `tech-tree.json` is dead data:
`goldCostForTechResearch` ignores the tech's own cost entirely (its `_tech`
param is unused) and prices off how many techs you already own
(`tech-wonder-gold-discount.ts:9-17` → `tech-economy.ts:21-28`). Every
remaining tech costs the same at any moment, and each one you take raises
that shared price: **10, 40, 70, 100, 130, 170, 210, 250…**

That is a good system, and it makes tech *ordering under scarcity*, which is
a form of commitment. Against ~10 gold/day/town income, flat until CITY, a
first-week player affords roughly three or four techs total. Which one they
take first genuinely matters, because the second costs 4× the first.

What's wrong with it **in the opening** is therefore the opposite of what
that draft claimed. The decision is real; the player has nothing to make it
with. At minute 0 they cannot see their own map (§2D, §3), so "do I want
Masonry or Trade first" is a blind pick between six names. The gateway does
send the live price per choice (`init-payload.ts:963`), so the number shown
is honest — but it shows only the *current* price, giving no signal that
this is a one-of-three-this-week decision rather than a routine purchase.

Domains are the other axis, and there the exclusivity is structural:
`openDomainChoices` opens exactly one tier at a time and closes it the
moment you pick (`tech-domain-bridge.ts:113-128`) — 5 exclusive picks across
a 30-day season, at 40 / 200 / 400 / 800 / 1800 gold.

The tier-1 five are genuinely characterful and genuinely divergent —
Frontier Doctrine (settle speed + a dev slot), Dwarf Kingdom (forts),
Dewildernisation (anti-barbarian), Mercantile Charter (tall first three
towns), Clockwork Stipend (a resource slot regardless of map). This is the
best "who am I" content in the game.

It costs 40 gold against a 10-gold start and ~10 gold/day/town income, and
`townPopulationMultiplier` returns 1 for TOWN tier — gold income per town is
effectively **flat until CITY**, at 1,000,000 population. So the first
identity-defining choice lands around **day 2**, long after the opening is
over and the player has either stayed or left.

**Consequence:** the opening asks the player to make no commitments, so
there is nothing to be right or wrong about, and nothing to regret.

### C. A threat — **removed three independent times**

Four separate settings each, on their own, push first contact out of the
opening; together they make the early game single-player:

1. **Spawn placement actively maximizes separation** — it is not merely a
   minimum. The season-seed roster samples random points and rejects any
   within `minSpawnDistance: 50` of an existing spawn
   (`season-seed-world-player-spawn.ts:85-89`); the fair-spawn roster used
   for later joiners is worse still, built by `farthestPointFill`, an
   explicit greedy farthest-point sampler where "each added site maximizes
   its minimum Chebyshev distance to every site already chosen"
   (`server-worldgen-fair-spawn-sites.ts:105-114`), targeting 50 sites
   (`:96`) for a world that holds ~10 empires.

   **This is why lowering `minSpawnDistance` does not work**, and an earlier
   draft of this brief wrongly proposed it as the cheap first lever.
   Dispersion is the *objective*, not the constraint — relaxing the floor
   only makes rejections rarer while random uniform sampling keeps expected
   pairwise distance at map scale. To place players near each other you have
   to change the objective or shrink the domain (see §4.1).
2. `SIMULATION_AI_PLAYER_COUNT = "5"` in prod and staging on a 204,800-tile
   world. Land is a fraction of that, but ~10 empires on a continents map is
   an order of magnitude below the density the rest of the tuning assumes.
3. Barbarians: 30 seeded tiles, ≥12 from any spawn, and passive until a
   player becomes adjacent — so they are opt-in, not pressure.
4. Mustering — the whole combat verb — is hidden from the tile menu until
   the player has met an enemy this season
   (`client-muster-tile-actions.ts:29`). Reasonable UI hygiene given (1)–(3),
   but it means the opening's own design acknowledges there is no one to fight.

This is the most expensive miss in the list, because the game already owns
the systems that only become interesting under pressure: reach contests
(`grantAnchorToBorder`'s live-defense resolution), the out-of-reach decay
exemption for contested borders (`config.ts` `OUT_OF_REACH_DECAY_MS`),
forts, sieges, truces, alliances. At current density, a player's reach
border almost never touches another's, so the entire contested-border branch
of `reach.ts` is dead code in practice for most of a season.

**Consequence:** the opening teaches the player that the map is a resource
to be farmed rather than ground to be held — exactly the mental model the
mid-game expansion-motivation brief is fighting.

### D. A surprise — **the content exists, but not in the opening**

The two best discovery beats in the game are both real and both well-made:

- **Waystations** — expand onto one and it permanently grants one of four
  random boons: a map reveal, a population burst, a tech outright, or an
  extra resource slot (`runtime-waystation-activation.ts`). This is the
  single best "something happened" moment the game has.
- **Shard rain** — 3–6 contested sites with a 30-minute TTL, scheduled at
  hours 12 and 20 (`SHARD_RAIN_SCHEDULE_HOURS`).

Neither is placed with the opening in mind. Waystations are scattered at 1
per 400 tiles with 18-tile spacing (`config.ts:34-35`), so the chance one
falls inside the starting reach-3 bubble is roughly 12%. Shard rain's
earliest firing is hour 12. Natural wonders — 9 on the whole map
(`docs/natural-wonders-design.md`) — are a rounding error at opening scale,
as are 238 resource clusters across 204,800 tiles.

**Consequence:** ~88% of players get no surprise at all in session 1. The
game's best hook is left to chance and usually doesn't fire.

### E. A reason to come back — **present, but it's a timer, not a hook**

The genuine retention mechanics are offline-friendly by deliberate design:
manpower refills over ~30 hours, the starting settlement tiers up in ~2.5
hours, yields accumulate offline up to 12 hours
(`OFFLINE_YIELD_ACCUM_MAX_MS`). This is correct for the twice-a-day check-in
cadence the game is tuned for, and should not be traded away.

But every one of those is a **replenishment** hook: come back because a bar
refilled. Replenishment gets the tab opened; it does not make the player
care what they find. The three hooks that do are appointment, jeopardy, and
unresolved intent. The game has partial machinery for all three and aims
none of it at the opening.

**Appointment — something happens at a known time whether you're there or
not.** Shard rain is a real, well-built appointment mechanic: 3–6 sites, a
30-minute TTL, at a published hour. Three things keep it out of the opening.
It first fires at hour **12** (`SHARD_RAIN_SCHEDULE_HOURS = [12, 20]`); it
is world-scheduled, so a new empire with no site near its reach cannot
participate at all; and it pays in Shards, which fund monuments — a
late-game system a day-1 player has no concept of. Re-aiming it is cheaper
than inventing anything: a first, personal, early firing placed **inside the
new player's own reach**, paying something legible at that stage (manpower,
gold, a free tech), gives session 1 a deadline.

**Jeopardy — something you hold can be lost while you're away.** The
strongest hook in any territory game, and the one this game deliberately
suppresses, correctly: harsh offline loss would wreck the twice-a-day
cadence §6 protects. But jeopardy and offline punishment are not the same
thing. The distinguishing feature is *advance warning*: a threat you can see
coming and act on before it lands creates tension without taxing absence.
Barbarians are exactly that system — they hold progress, multiply, and walk
(`runtime.ts`, and the +2-for-juicy-targets rule the expansion brief's §3
documents) — but at 30 seeded tiles, ≥12 from spawn, passive until adjacency,
they are opt-in encounters rather than approaching weather. A visible
barbarian force with a legible arrival time is the Civ "camp spotted" beat,
and it needs proximity and telegraphy, not new mechanics.

**Unresolved intent — "I left something running."** Genuinely present and
undersold. `DEVELOPMENT_PROCESS_LIMIT = 3` means a player always logs off
with three things cooking, and the waypoint system lets them queue a plan
that the server replays while they are offline (`WAYPOINT_MAX_WIRE_STEPS`,
`WAYPOINT_OFFLINE_GRACE_MS`). "Come back and see what your plan did" is a
real hook that the client never frames as one.

**Underneath all three: the opening never states a goal.** Five victory
paths exist, every one requiring a 24-hour hold, and none is surfaced as a
live readout — the expansion brief's §5D makes the same finding from the
mid-game side, which suggests it is one gap, not two. A day-1 player cannot
name what they are trying to do. The onboarding checklist is the only stated
objective and it self-destructs once satisfied and is never shown again
(`client-onboarding-checklist.ts`). Without a goal there is no progress, and
without progress "come back tomorrow" is a chore rather than an appointment.

## 3. The verb problem, and why it compounds all of the above

The opening has one verb, and that verb is partly automated.

"Expand To" auto-settles once ownership lands
(`client-onboarding-checklist.ts` header comment); the client auto-fills
SETTLE commands from a server-held eligibility queue
(`runtime-auto-settle-eligibility.ts`, cap 20/player); captured towns and
docks auto-settle even out of reach. The remaining input is: click a tile,
watch a 7.5s bar, watch a 60s bar. `DEVELOPMENT_PROCESS_LIMIT = 3` throttles
it, but as the expansion brief established, that limit is *contention*
between settling and building, not a choice between them.

The mid-game brief's hypothesis E ("expansion is repetitive") is usually
read as a late-game complaint. It is actually worse in the opening, because
in the opening it is the *only* thing happening. The mid-game at least has
structures, tech, and neighbours competing for attention.

**On vision, narrower than an earlier draft claimed.** That draft said the
player is blind inside their own border. They are not, and the correction
matters. A town tile carries an unconditional +1 on top of base vision
(`runtime-town-vision.ts:25-29`), so the capital sees radius 2 — a 5×5 of
the 7×7 reach bubble. Every FRONTIER claim then adds its own standing
radius-1 halo (`FRONTIER_STANDING_VISION_RADIUS`, `config.ts:58`), so
claiming peels the remaining fog back as you go. Inside reach-3 the fog is
a formality: expansion is cheap, the bubble is small, you take all of it.

The real and narrower issue is **ordering, and the cost of looking past the
bubble**. Vision follows the claim, never precedes it, so "which tile should
I take" is never an informed question — but inside reach that barely
matters. It matters at the next ring out, which is exactly where the
checklist points the player ("find a town", "find food tiles" — both
typically 5–10 tiles away, outside both vision and reach). The tool for that
is the Relay Beacon's +5 vision, and it must be built on SETTLED ground
(`runtime-structure-command-handlers.ts:307`): expand + settle + build,
60 manpower and ~2.1 minutes, placed on land you already hold. So extending
toward an unseen objective is a commitment made blind, repeated per hop.
There is no cheap look-before-you-leap at any point in the opening.

## 4. Candidate levers, ranked by value ÷ cost

### 1. Compress the world to its population — *highest leverage, and the lever is not the one it looks like*

If first contact happens in session 1 instead of week 1, mustering unlocks,
the ENEMY_EMPIRE and BARBARIAN discovery tips fire, defense becomes a real
consideration, and the entire contested-reach branch of `reach.ts` starts
executing. No new systems required — this is turning on systems that already
shipped.

But **relaxing `minSpawnDistance` is not the way there** (§2C). Three
mechanisms that actually move density, in ascending cost:

- **Shrink the world.** `WORLD_WIDTH`/`WORLD_HEIGHT` are plain constants
  (`config.ts:15-16`) and the 640×320 figure was chosen to preserve tile
  count across an aspect-ratio change, not from a density target. Halving
  area quadruples encounter probability for a fixed roster and touches no
  placement logic. Cheapest real lever; needs a worldgen-lab pass to confirm
  70 towns and 238 clusters still lay out sanely at the smaller size.
- **Seed in pods rather than dispersed.** The machinery already exists:
  `RALLY_SPAWN_SEARCH_ORDER` places a rally-linked spawn at
  `minSpawnDistance: 3` within `RALLY_SPAWN_RADIUS = 24` of an anchor
  (`spawn-placement.ts:66-74`). Generalizing that — seed the first spawn
  anywhere, place each subsequent one in a band around an existing one —
  makes neighbours a guarantee instead of a lottery, and reuses a tested
  code path. It does mean deciding who neighbours whom, which is a real
  design question (skill? join time? random?) rather than a tuning knob.
- **Raise the roster.** `SIMULATION_AI_PLAYER_COUNT = 5` looks like a CPU
  ceiling rather than a design choice, given the barbarian re-export
  incident documented at `season-barbarian-seed.ts:1-10` and the
  `SIMULATION_AI_WORKER` split. Needs a load-harness pass
  (`docs/agents/topics/load-harness.md`) before it goes near prod, and it
  does nothing for density on its own if dispersion stays the objective.

### 2. Move the tier-1 domain choice to minute 0 — *small diff, buys a label; pair with 3 for an identity*

Make the five tier-1 domains a free pick at spawn instead of a 40-gold
purchase two days in. The content already exists, is already exclusive, is
already flavorful, and is already the only real branching decision in the
game. The plumbing to apply a starting bonus at JoinSeason already exists
(`pendingGalacticWonderBonus`).

**This alone is not enough, and shouldn't be sold as a fix.** It buys the
player a *label*, not a *strategy*, because none of the five changes what
they do next: whichever you pick, minute 1 is still "expand into your reach
bubble." A starting choice only creates identity when it makes the opening
itself play differently — when Dwarf Kingdom and Frontier Doctrine imply
different first ten moves, not different multipliers on the same ten.

The deeper source of identity is the **map**, and the game already computes
the inputs and shows the player none of them: `townTypeAt` assigns every
town MARKET or FARMING (`server-worldgen-towns.ts:39-45`), spawns are
coastal-biased via `computeCoastalLandKeys`, and there are five named
regions with distinct resource profiles. Whether you are a coastal
dock-and-trade empire or an inland fort-and-titanium one is *already
decided* at spawn — the player is simply never told, and cannot see far
enough to work it out (§3).

So levers 2 and 3 are one change, not two: **reveal the ground, then let
the player choose a doctrine that fits it.** A free tier-1 pick made blind
is a coin flip; the same pick made after seeing a 12-tile radius is the
opening's first real decision, and it is a decision *about the map* rather
than off a menu.

*Open question:* does giving tier 1 away free devalue the tier-2 pick at 200
gold, or just shift the ladder one step earlier? Probably the latter, but
worth a tuning pass on 200/400/800/1800 — especially now that tech prices
escalate into the same gold pool (§2B), which the original curve may not
have been set against.

### 3. Give the player a map to have opinions about — *worldgen, one rule*

A one-time spawn reveal of ~radius 12 showing **terrain, towns and docks but
not resources** would let the player arrive with a plan instead of groping.
Resources stay behind their existing per-category tech-reveal gates
(`hasRevealedResourceForPlayer`), so this costs nothing in terms of the
resource-discovery progression the discovery tips are built around.

Note the irony this fixes: the spawn algorithm *already* guarantees a town
within 10 tiles and food within 10 tiles, then hides both and makes "find a
town" the player's first assigned objective.

### 4. Guarantee one waystation in the starting band — *worldgen, one rule*

Place exactly one waystation within the starting reach-5 band at every
spawn. Every player then gets the game's best surprise beat in session 1
instead of 12% of them. This is the cheapest possible fix for (D) and it
reuses a finished, tested system end to end.

### 5. Give session 1 a deadline and a stated goal — *re-aiming, not new systems*

Per §2E, the opening's only return hooks are replenishment timers. Two
existing systems fix that without new mechanics: fire a **first, personal
shard-rain-style event early and inside the new player's reach**, paying in
manpower or gold rather than Shards; and give barbarians enough proximity
and telegraphy to become approaching weather rather than opt-in encounters.
Both need placement and scheduling changes, not code.

Pair either with a **persistent stated goal** — the victory paths already
have thresholds in `server-game-constants.ts` and no live readout anywhere.
The expansion brief's §5D asks for exactly this from the mid-game side;
building one progress-readout surface serves both, and would give the
opening something the self-destructing onboarding checklist cannot.

### 6. Give manpower a second sink in the opening — *tuning*

720 manpower with one legal use is a big number with no tension. The
cleanest way to create the tension is (1) — an opponent makes ATTACK (60 mp)
compete with EXPAND (10 mp) — but a cheaper interim version is to stop the
first neutral town being free. It currently costs 30 manpower total
(expand + settle) and is never contested. Making the guaranteed nearby town
something you have to *commit* to, rather than something you walk onto,
would give the opening its first real trade-off.

### 7. Fire the arrival letter — *copy only*

The game's writing is good and almost entirely unused at the start. The
Imperial Court decree (`client-space-view-welcome-letter.ts`) is well-judged
and fires *after a victory*. "The Bleed" for barbarians, the Duke memoir,
the five region names — all present, none of it framing minute 0. An arrival
decree at spawn, reusing the parchment treatment that already exists, is a
copy-and-placement task, not a feature.

## 5. The hook — which game to actually copy

The natural instinct is to chase Civilization's "one more turn." It does not
port, and aiming at it wastes the machinery this repo already contains.

### 5.1 Why Civ's hook doesn't transplant

"One more turn" is an emergent property of five specific mechanisms. Scored
against this game's constraints:

| Civ mechanism | Ports here? |
|---|---|
| **The game demands input** — turn-based, it does not advance without you | **No, structurally.** Real-time persistent world. The sim runs whether or not anyone is watching. This is the load-bearing one and it is simply unavailable. |
| **Staggered timers that never align** — settler in 3 turns, tech in 7, wonder in 12, so you can never stop cleanly | **Inverted.** Civ's stagger works because a turn is seconds. Here the timers are 60s to 30h, so "something always resolves next turn" becomes "nothing resolves in this sitting." Copying the pattern produces waiting, not tension. |
| **Fog reveal as a slot machine** — every tile might be a hut, a wonder, a rival | **Yes.** This is §4.3 (spawn reveal) and §4.4 (guaranteed waystation). Worth doing. |
| **Visible compounding** — improvements accumulate on the map | **Partly.** Territory does accumulate visibly; structures less so at one-per-tile. |
| **Dense early scripted-feeling beats** — hut pop, first barbarian, first contact | **Yes**, and §4.4/§4.5 are exactly this. |

Two of five port cleanly, one is inverted, one is impossible. Chasing Civ
buys at most a partial hook designed for a session shape this game does not
have.

### 5.2 The right reference class

The genre peers are the **persistent browser and mobile 4X** lineage —
Travian, Tribal Wars, Grepolis, OGame, and the modern mobile descendants.
Same shape as Border Empires: persistent real-time world, asynchronous
players, multi-week season, players checking in once or twice a day.

Their hook is not "one more turn." It is three things:

1. **The sortie.** You arrive with a full bank, and the pleasure is spending
   it to zero, setting timers, and leaving. The session has a natural shape:
   arrive rich, leave empty and committed.
2. **"What happened while I was asleep."** You log in for *news*, not for a
   refilled bar. Someone attacked. An alliance broke. You dropped a rank.
3. **Other players are the content.** Every notification worth having names
   a person.

### 5.3 All three are already built here

This is the finding that should reframe the whole effort. Border Empires has
not failed to build a retention machine — it has built one and starved it of
its single input.

- **The sortie shape** exists: a 720-manpower bank against a ~30h refill
  (`config.ts:160-161`) is precisely the arrive-rich/leave-empty rhythm.
  What it lacks is more than one thing to spend on (§2C, §4.6).
- **The news engine** exists and is *good*. `buildDailyStory`
  (`activity-api/daily-story.ts`) emits BIGGEST_DEFEAT, OPEN_WAR,
  FIERCEST_FIGHTING, BLOODIEST_BATTLE, FIERCEST_ATTACKER, TOUGHEST_TARGET,
  ALLIANCE_FORMED, ALLIANCE_BROKEN, FASTEST_EXPANSION, STRONGEST_EMPIRE —
  ranked by a cross-metric significance scale deliberately calibrated
  against real prod output (`daily-story-significance.ts:1-31`). It is a
  finished "what happened while you were away" generator.

  **It is delivered to Slack, for the developers**
  (`daily-activity-digest-message.ts`). Players get an activity feed of
  their own events (`client-event-log-html.ts`), which is not the same
  thing: the feed is a log, the daily story is a narrative with stakes and
  a named cast.
- **The pull notifications** exist: players receive gameplay emails for
  `attack`, `alliance_request`, `alliance_break`, `truce_request`,
  `season_start` (`gameplay-email-alert.ts:3`). Four of those five fire only
  when another player acts on you.
- **The scoreboard** exists — power score with ranks, already computed for
  the digest.
- **A social density lever** exists: rally links (`/r/<code>`,
  `client-rally-links.ts`) spawn an invitee within `RALLY_SPAWN_RADIUS = 24`
  of the inviter at `minSpawnDistance: 3` (`spawn-placement.ts:66-74`) —
  a "bring your own neighbour" path that bypasses the dispersion objective
  entirely.

Every one of those requires **another player near you** to fire. At five
maximally-dispersed AI on 204,800 tiles, none of them do. The answer to "how
do we get a hook" is therefore not "build a hook." It is **supply the
input** (§4.1) and **point the existing narrative at the player** rather
than at Slack.

### 5.4 The opening as a three-session arc

Concrete target to design against, in place of a vague "make it fun":

- **Session 1 (0–20 min) — arrival.** See the ground (§4.3 spawn reveal),
  make one choice about it (§4.2 doctrine), get one surprise (§4.4
  waystation), and leave with something committed that resolves while away
  (the queue/waypoint framing in §2E). Ends with the bank spent.
- **Session 2 (6–12h) — news.** Open to a daily-story-style report naming
  what changed, not a list of your own clicks. A visible neighbour or
  approaching barbarian force. A goal with a progress readout (§4.5).
- **Session 3 (day 2) — contest.** Something another agent wants that you
  also want, with your reach border touching theirs — the mechanic
  `grantAnchorToBorder` was written for and which currently almost never
  executes.

If session 3 cannot be reached because there is nobody within 50 tiles, no
amount of work on sessions 1 and 2 will matter. That ordering is the whole
argument for §4.1 being first.

## 6. What NOT to do

- **Don't add offline decay or depleting nodes.** *Offline decay* is the
  genre term for any mechanic where your position degrades in real time
  while you are logged out — stockpiles draining, buildings falling into
  disrepair, territory reverting, garrisons starving. It is common in
  browser and mobile 4X because it manufactures urgency cheaply, and it is
  the wrong tool here: the 30h manpower refill and the 12h offline-yield
  accrual window are deliberate (`server-game-constants.ts:44`,
  `config.ts:151-161`), tuning the game for players who check in twice a
  day. Punishing absence would fight a load-bearing assumption, and the
  expansion brief's §3 carries the same warning against a Frostpunk-style
  depleting-node model.

  Worth separating from three things this game already does, none of which
  are offline decay: `OUT_OF_REACH_DECAY_MS` (120s) and encirclement
  cut-off are **positional** rules that fire identically whether or not you
  are watching, and the 12h yield cap **bounds the reward** for being away
  rather than imposing a penalty. Jeopardy with advance warning (§2E) is
  also not offline decay — the distinction is whether the player got a
  chance to act before it landed.
- **Don't add friction to the one verb.** Making EXPAND cost more or take
  longer makes a boring action slower. The problem is that it's the only
  action, not that it's too cheap.
- **Don't solve this with more UI.** The expansion brief's §7 already
  records that its first round of surfacing/highlighting ideas was correctly
  called cosmetic. The opening's problem is that there is nothing to surface:
  no rival, no choice, no stakes. Add the thing first, then surface it.

## 7. Open questions

1. What is the *actual* observed time-to-first-contact in a live season with
   5 AI? Worth instrumenting before tuning `minSpawnDistance` blind — the
   estimate here is derived from spawn geometry, not from telemetry.
2. What is the land fraction on a continents-style 640×320 map? Every
   density argument in §2C sharpens or softens depending on it, and it was
   not measured for this brief. `apps/worldgen-lab` reports it live.
3. Does the AI expand fast enough that raising its count would actually
   produce contact, or would 20 AI simply be 20 distant AI? Check against
   `docs/agents/topics/load-harness.md` before assuming count alone fixes it.
4. Is `SIMULATION_AI_PLAYER_COUNT = 5` a design choice or a CPU-budget
   choice? The comments around it in `fly.combined.toml` suggest the latter.
   If it's a budget ceiling, lever 1 is really "shrink the world", not "add
   AI", and should be framed that way.
5. What stops the daily story going to players (§5.3)? It is written,
   ranked and calibrated. Is the blocker that a 5-AI world produces no story
   worth sending — in which case it is gated on §4.1 like everything else —
   or is it simply that nobody has pointed it at an audience?
6. Are the tier-1 domains balanced *as opening picks*? They were priced as
   day-2 purchases. Clockwork Stipend (a resource slot regardless of map) is
   plausibly much stronger at minute 0 than at day 2, when the player already
   knows what their map gave them.

## 8. Verification log — check before citing

Read directly from source on 2026-09-19. **`README.md`'s economy and
mechanics sections are stale** and were not used as a source here.

**Corrections to this brief's own first draft** (2026-09-19, same day —
caught in review, listed here because the wrong versions were pushed):

- *"All 41 techs cost a flat 10 gold."* **Wrong**, and it inverted the
  conclusion. The draft read `cost.gold` out of `tech-tree.json` without
  checking the pricing function. That field is dead: `goldCostForTechResearch`
  takes `_tech` and never reads it, pricing instead off `techIds.size`
  (`tech-wonder-gold-discount.ts:9-17`). The live curve is
  `techGoldCostForResearchedCount` — 10, 40, 70, 100, 130, 170, 210, 250,
  with per-tech increments stepping +30 / +40 / +50 at N=5 and N=10
  (`tech-economy.ts:19-28`). Tech is a genuine budget decision, not free
  ordering. **Lesson, same as the one the expansion brief logged: read the
  function that charges, not the data file that declares.**
- *"Vision radius 1 — a 3×3."* **Wrong for the capital.** Every town adds an
  unconditional +1 (`runtime-town-vision.ts:25-29`), so a starting
  settlement sees radius 2 / a 5×5, and each FRONTIER claim adds its own
  radius-1 halo (`config.ts:58`). The player is not blind inside their reach
  bubble; see §3 for the narrower claim that survives.
- *"Lower `minSpawnDistance` from 50 toward ~15–20 — the free half of this
  lever."* **Wrong lever.** Dispersion is the placement *objective*, not a
  floor: `farthestPointFill` maximizes each new site's minimum distance to
  all existing ones (`server-worldgen-fair-spawn-sites.ts:105-114`), and the
  season-seed path samples uniformly at random, so relaxing the floor leaves
  expected pairwise distance at map scale. See §4.1 for the three levers
  that do move density.

Confirmed accurate (safe to cite): `WORLD_WIDTH/HEIGHT = 640/320`
(`config.ts:15-16`); `PLAYER_BASE_VISION`/`VISION_RADIUS = 1` before the
town +1 (`:18,21`);
`FRONTIER_CLAIM_MS = 7_500` (`:82`); `SETTLE_MS = 60_000` (`:101`);
`DEVELOPMENT_PROCESS_LIMIT = 3` (`:114`); `EXPAND_MANPOWER_COST = 10` /
`SETTLE_MANPOWER_COST = 20` / `ATTACK_MANPOWER_COST = 60` (`:139,142,210`);
`STARTING_CAPITAL_MANPOWER_CAP = 720` at 0.4/min (`:160-161`);
`TOWN_REACH_RADIUS = 3` / `OUTPOST_REACH_RADIUS = 5` (`:286,290`);
`CLUSTER_COUNT_MIN/MAX = 238` (`:313-314`); `STARTING_GOLD = 10`
(`server-game-constants.ts:55`); `GOLD_RESCALE_DIVISOR = 288` with both
`SETTLEMENT_BASE_GOLD_PER_MIN` and `TOWN_BASE_GOLD_PER_MIN` at `2/288`
(`:54,58,133`); world town target `max(70, floor(180 * worldScale))` = **70**
(`server-worldgen-towns.ts:89`); spawn `minSpawnDistance: 50` with a town
required within 10 (`season-seed-world-player-spawn.ts:80,85`);
`BARBARIAN_SEED_TARGET = 30` at `MIN_DISTANCE_FROM_SPAWN = 12`
(`season-barbarian-seed.ts:11-12`); `SIMULATION_AI_PLAYER_COUNT = "5"` in
both `fly.combined.toml:67` and `fly.combined.staging.toml:87`.

Corrections to figures cited in `docs/expansion-motivation-exploration-brief.md`,
which the manpower rewrite has since overtaken:

- That brief's §2B cites `FRONTIER_CLAIM_COST = 1` gold and
  `SETTLE_COST = 4` gold. **Both are now 0** (`config.ts:78,100`) — expansion
  is priced in manpower (10 / 20), not gold. Its "flat gold cost decays to
  thoughtlessness" mechanism no longer describes the live system; the
  equivalent live question is whether *manpower* cost decays relative to
  manpower cap, which is a different curve and was not re-derived here.
- That brief cites `FRONTIER_CLAIM_MS = 1250`. Live value is **7,500**
  (`config.ts:82`), with a comment recording the halving from 15,000.
- That brief's §2A cites per-day tile yields (FARM 48 FOOD/day etc.) from
  `tile-yield-view.ts`. Those code paths are now stubs:
  `strategicDailyFromResource` and `converterDailyOutput` both return `{}`
  unconditionally (`tile-yield-view.ts:46,54-57`), because FOOD became
  slot-based rather than produced. Tile *yield* is no longer a meaningful
  quantity for FARM/FISH; slot supply is.
- The SETTLEMENT→TOWN population threshold is **1,000**, not the 10,000 that
  `POPULATION_TOWN_MIN` suggests — `townPopulationTier` short-circuits on
  `town.isSettlement && town.population < 1_000` (`season-seed-world.ts:100`)
  before `POPULATION_TOWN_MIN` is ever consulted. Starting population is 800
  (`:91`), so the first tier-up is ~2.5h, not ~33h.

Not verified, flagged as estimates: the ~2.5h tier-up and ~30h manpower
refill are arithmetic from the constants, not measured in a running sim; the
~12% waystation-in-starting-bubble figure is a density estimate that ignores
the 18-tile spacing constraint's interaction with spawn placement; land
fraction on a continents map was not measured (see §7.2).

## 9. Reference map (open these first)

- `apps/simulation/src/season-seed-world-player-spawn.ts` — spawn search order, the town/food-within-10 guarantee, `minSpawnDistance: 50`.
- `apps/simulation/src/spawn-placement/spawn-placement.ts` — the rally/legacy spawn passes and `MIN_TOWN_SPAWN_DISTANCE`.
- `apps/simulation/src/season-barbarian-seed/season-barbarian-seed.ts` — barbarian seed count and spawn clearance, plus the CPU incident note that explains why it's small.
- `packages/client/src/client-onboarding-checklist/client-onboarding-checklist.ts` — the whole new-player guidance surface; its header comment is the best existing prose description of the opening loop.
- `packages/client/src/client-muster-unlock/client-muster-unlock-storage.ts` + `client-muster-tile-actions.ts:29` — the first-contact gate on combat.
- `packages/shared/src/tech-economy.ts` — the real tech price curve (10/40/70/100/130/170…), reached via `tech-wonder-gold-discount.ts`. **Read this, not `tech-tree.json`'s `cost.gold`, which is dead data.**
- `apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts:113-128` — `openDomainChoices`, the one-exclusive-pick-per-tier gate; `:354-376` for instant, timer-free research.
- `packages/game-domain/src/server-worldgen-fair-spawn-sites.ts:105-114` — `farthestPointFill`, the max-dispersion spawn objective behind §2C and §4.1.
- `apps/simulation/src/runtime-town-vision.ts:25-29` — every town's unconditional +1 vision, the correction behind §3.
- `packages/game-domain/data/domain-tree.json` — the five tier-1 domains proposed as the minute-0 identity pick in §4.2.
- `apps/simulation/src/runtime-waystation-activation.ts` — the four random permanent boons behind §4.4.
- `packages/shared/src/reach/reach.ts` — `grantAnchorToBorder`'s contested-border resolution, the system that density currently keeps dormant.
- `packages/client/src/client-space-view/client-space-view-welcome-letter.ts` — the decree treatment §4.7 proposes reusing at spawn.
- `apps/realtime-gateway/src/activity-api/daily-story.ts` + `daily-story-significance.ts` — the finished "what happened while you were away" narrative engine behind §5.3. Currently delivered only to Slack.
- `apps/realtime-gateway/src/gameplay-email-alert/gameplay-email-alert.ts:3` — the five player-facing pull notifications; four of them need a neighbour to fire.
- `packages/client/src/client-rally-links/client-rally-links.ts` — the bring-your-own-neighbour spawn path (§5.3), the one density lever that needs no tuning decision.
- `docs/expansion-motivation-exploration-brief.md` — the mid-game companion; read §7 there before proposing anything cosmetic here.
