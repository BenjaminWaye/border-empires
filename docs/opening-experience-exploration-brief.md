# The Opening — Exploration Brief

> **Status:** Early exploration, NOT a committed design. Companion to
> `docs/expansion-motivation-exploration-brief.md`, which diagnosed why
> expansion stops mattering in the *mid* game. This one asks the earlier
> question: **is the first session interesting at all, and if not, what is
> structurally missing?**
>
> Every number below was read out of live source on 2026-09-19 (see §7 for
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
| Vision | **radius 1** — a 3×3 (`config.ts:18,21`) |
| Reach | **radius 3** — a 7×7 you may claim into, 48 tiles (`config.ts:286`) |
| Tech | none researched; 6 tier-1 options, all 10 gold, **instant** |
| Nearest rival | **≥50 tiles** (`season-seed-world-player-spawn.ts:85`) |
| Rivals in world | **5 AI** (`fly.combined.toml:67`) on 640×320 = 204,800 tiles |
| Nearest barbarian | **≥12 tiles**; only **30** barbarian tiles world-wide at seed (`season-barbarian-seed.ts:11-12`) |
| Combat | **hidden from the UI** until first contact with an enemy (`client-muster-tile-actions.ts:29`) |
| Guidance | a 4-item checklist: find a town → take it → find 4 food slots → take them (`client-onboarding-checklist.ts`) |

Available verbs: EXPAND (10 mp, 7.5s), SETTLE (20 mp, 60s, 3 concurrent),
build a RELAY_BEACON (30 mp, 60s, +5 reach / +5 vision), research one tech.
That is the entire opening action space.

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

The progression system has exactly one real branching choice, and it is not
tech. All 41 techs cost a flat 10 gold (`tech-tree.json`), are researched
**instantly** with no timer (`chooseTechForPlayer`,
`tech-domain-bridge.ts:354-376`), and are non-exclusive — `reachableTechChoices`
is a pure prerequisite filter (`:103-112`), so you eventually own all of
them. Tech is unlock *ordering*, not commitment.

Domains are the commitment: `openDomainChoices` opens exactly one tier at a
time and closes it the moment you pick (`:113-128`) — 5 exclusive picks
across a 30-day season, costing 40 / 200 / 400 / 800 / 1800 gold.

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

1. `minSpawnDistance: 50` on every quality pass of spawn search
   (`season-seed-world-player-spawn.ts:85-89`).
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

But "your bar refilled" is a reason to *open the tab*, not a reason to care.
Nothing in the opening establishes a rival, a contested prize, or a stated
goal beyond a checklist that self-destructs once satisfied and is never
shown again.

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

Compounding it: vision 1 against reach 3 means you cannot see most of what
you may claim, and there is no scout unit, no reveal action, and no explore
verb. The checklist's literal first instruction is "find a town" — a goal
the player has no tool to pursue except claiming tiles blindly and hoping.
Exploration is not a decision here; it is a side effect of the one verb.

## 4. Candidate levers, ranked by value ÷ cost

### 1. Compress the world to its population — *config only, highest leverage*

Nothing else on this list changes as much per line of diff. Some combination
of: lower `minSpawnDistance` from 50 toward ~15–20, raise
`SIMULATION_AI_PLAYER_COUNT` well above 5, and/or shrink the world for
low-population seasons.

If first contact happens in session 1 instead of week 1, mustering unlocks,
the ENEMY_EMPIRE and BARBARIAN discovery tips fire, defense becomes a real
consideration, and the entire contested-reach branch of `reach.ts` starts
executing. No new systems required — this is turning on systems that already
shipped.

*Risk to check first:* the AI is already the sim's dominant CPU cost
(`SIMULATION_AI_WORKER`, the barbarian re-export incident documented in
`season-barbarian-seed.ts:1-10`). Raising AI count needs a load-harness pass
before it goes anywhere near prod. Lowering `minSpawnDistance` is the free
half of this lever and should be tried first.

### 2. Move the tier-1 domain choice to minute 0 — *small diff, buys an identity*

Make the five tier-1 domains a free pick at spawn instead of a 40-gold
purchase two days in. The content already exists, is already exclusive, is
already flavorful, and is already the only real branching decision in the
game. The plumbing to apply a starting bonus at JoinSeason already exists
(`pendingGalacticWonderBonus`).

This converts the opening from "claim tiles" to "claim tiles *as somebody*",
and it makes season N+1's opening feel different from season N's. It also
removes the awkward situation where the game's best choice is unaffordable
for exactly as long as the player is deciding whether to keep playing.

*Open question:* does giving tier 1 away free devalue the tier-2 pick at 200
gold, or does it just shift the whole ladder one step earlier? Probably the
latter, but worth a tuning pass on the 200/400/800/1800 curve.

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

### 5. Give manpower a second sink in the opening — *tuning*

720 manpower with one legal use is a big number with no tension. The
cleanest way to create the tension is (1) — an opponent makes ATTACK (60 mp)
compete with EXPAND (10 mp) — but a cheaper interim version is to stop the
first neutral town being free. It currently costs 30 manpower total
(expand + settle) and is never contested. Making the guaranteed nearby town
something you have to *commit* to, rather than something you walk onto,
would give the opening its first real trade-off.

### 6. Fire the arrival letter — *copy only*

The game's writing is good and almost entirely unused at the start. The
Imperial Court decree (`client-space-view-welcome-letter.ts`) is well-judged
and fires *after a victory*. "The Bleed" for barbarians, the Duke memoir,
the five region names — all present, none of it framing minute 0. An arrival
decree at spawn, reusing the parchment treatment that already exists, is a
copy-and-placement task, not a feature.

## 5. What NOT to do

- **Don't add offline decay or depleting nodes.** The 30h manpower refill and
  12h offline-yield window are deliberate (`server-game-constants.ts:44`, `config.ts:151-161`); the game is
  tuned for twice-a-day players. Punishing absence to manufacture urgency
  would fight a load-bearing design assumption. This mirrors the same
  warning in the expansion brief's §3.
- **Don't add friction to the one verb.** Making EXPAND cost more or take
  longer makes a boring action slower. The problem is that it's the only
  action, not that it's too cheap.
- **Don't solve this with more UI.** The expansion brief's §7 already
  records that its first round of surfacing/highlighting ideas was correctly
  called cosmetic. The opening's problem is that there is nothing to surface:
  no rival, no choice, no stakes. Add the thing first, then surface it.

## 6. Open questions

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
5. Are the tier-1 domains balanced *as opening picks*? They were priced as
   day-2 purchases. Clockwork Stipend (a resource slot regardless of map) is
   plausibly much stronger at minute 0 than at day 2, when the player already
   knows what their map gave them.

## 7. Verification log — check before citing

Read directly from source on 2026-09-19. **`README.md`'s economy and
mechanics sections are stale** and were not used as a source here.

Confirmed accurate (safe to cite): `WORLD_WIDTH/HEIGHT = 640/320`
(`config.ts:15-16`); `PLAYER_BASE_VISION`/`VISION_RADIUS = 1` (`:18,21`);
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
fraction on a continents map was not measured (see §6.2).

## 8. Reference map (open these first)

- `apps/simulation/src/season-seed-world-player-spawn.ts` — spawn search order, the town/food-within-10 guarantee, `minSpawnDistance: 50`.
- `apps/simulation/src/spawn-placement/spawn-placement.ts` — the rally/legacy spawn passes and `MIN_TOWN_SPAWN_DISTANCE`.
- `apps/simulation/src/season-barbarian-seed/season-barbarian-seed.ts` — barbarian seed count and spawn clearance, plus the CPU incident note that explains why it's small.
- `packages/client/src/client-onboarding-checklist/client-onboarding-checklist.ts` — the whole new-player guidance surface; its header comment is the best existing prose description of the opening loop.
- `packages/client/src/client-muster-unlock/client-muster-unlock-storage.ts` + `client-muster-tile-actions.ts:29` — the first-contact gate on combat.
- `apps/simulation/src/tech-domain-bridge/tech-domain-bridge.ts:103-128` — `reachableTechChoices` (non-exclusive) vs `openDomainChoices` (one exclusive pick per tier); `:354-376` for instant, timer-free research.
- `packages/game-domain/data/domain-tree.json` — the five tier-1 domains proposed as the minute-0 identity pick in §4.2.
- `apps/simulation/src/runtime-waystation-activation.ts` — the four random permanent boons behind §4.4.
- `packages/shared/src/reach/reach.ts` — `grantAnchorToBorder`'s contested-border resolution, the system that density currently keeps dormant.
- `packages/client/src/client-space-view/client-space-view-welcome-letter.ts` — the decree treatment §4.6 proposes reusing at spawn.
- `docs/expansion-motivation-exploration-brief.md` — the mid-game companion; read §7 there before proposing anything cosmetic here.
