# Planetary Defense camps (proposal)

Status: **proposal, rules agreed with the owner 2026-11-20; not implemented.**
Replaces the barbarian walk/multiply model described in
[`game-mechanics.md`](game-mechanics.md) (the "Barbarians (rewrite model)"
bullet) once built. Delete or fold into `game-mechanics.md` when shipped (see
[`README.md`](README.md) lifecycle policy). All rules below are
confirmed by the owner.

## Why

Planetary Defense (internal id `barbarian-1`) has no units. Every one of its
tiles is SETTLED and acts on its own, and it moves by **walking**: a tile takes
a neighbour and releases its own tile to neutral
(`apps/simulation/src/runtime-barbarian-walk.ts`). An attack releases its
origin as soon as it starts (`launchBarbarianAttack`), and barbarians alone may
land on the beach beside a linked dock. On the map this reads as patrols
teleporting:

- The 3D overlay guesses movement by comparing which tiles are barbarian-owned
  between redraws (`client-map-3d-planetary-defense-overlay.ts`, `commit()`).
  It only animates a jog when the release and the capture arrive in the same
  redraw (attacks never do), pairs each lost tile with the first adjacent new
  tile (wrong with several patrols close together), and ignores map wrap.
- The 2D overlay does not animate moves at all.
- Beach landings jump a patrol across a strait in one move.

Players also get no clear objective: there is nothing to destroy, only tiles
that keep wandering.

## Design: camps, like barbarians in Civ

Planetary Defense stays **one player** (`barbarian-1`) and plays by the same
territory rules as a House, apart from the rules listed here. One player per
camp was rejected: about 19 simulation loops, the planner views, gateway lists
and leaderboards all run per player, so 100 extra players would add load
everywhere.

1. **Camp = a SETTLED Planetary Defense tile.** Camps never move. Each
   Planetary Defense tile carries a `campId` (the camp's tile key), set when the
   tile is taken. It is saved with the tile and is the only new saved state.
2. **Frontier spreads from camps.** Planetary Defense captures become
   **FRONTIER** with the capturing camp's `campId`, as a House's captures do
   (today they are hard-coded to SETTLED in `runtime-winning-capture.ts`).
   There is **no reach and no radius**: barbarians keep projecting no reach
   (`runtime-reach-anchors.ts`), and a camp may spread as far as its actions
   and players allow.
3. **Camps don't move through each other.** A camp acts only from tiles with
   its own `campId`, so it never uses another camp's land as a road. Two camps
   never attack each other.
4. **Supply per camp.** A Planetary Defense frontier tile must connect to its
   own camp through tiles of the same `campId` (the normal encirclement rule,
   applied per camp). When a camp is captured, every tile with its `campId` is
   released to neutral directly, with no flood fill. A tile cut off from its
   camp mid-territory decays as usual.
5. **New camps come only from towns and docks.** When Planetary Defense
   captures a **town or a dock**, neutral or a House's, that tile becomes a
   new camp (SETTLED, its own new `campId`). Nothing else creates a camp, and a
   destroyed camp never comes back, so the force shrinks over a season as
   Houses clear it. At most **100 camps** (`MAX_BARBARIAN_TILES` is repurposed
   as the camp cap); at the cap a captured town or dock becomes FRONTIER. There
   is **no cap on total tiles**. The progress / multiply rule is removed.
6. **One action per camp every 15 s.** Each camp (the camp and its tiles)
   takes at most one EXPAND or ATTACK per `BARBARIAN_TILE_REST_MS` (15 s),
   counted from when the action settles. The global limit of
   `BARBARIAN_ATTACKS_PER_MINUTE` (12) stays.
7. **Only an online player wakes a camp** (option A). A camp acts only while a
   player who is **online** (map open; the simulation's `isPlayerSubscribed`)
   can see at least one of its tiles. An offline human's land never wakes a
   camp. **AI players count as always online**, so their vision always wakes
   camps (owner decision 2026-11-20).
8. **Raid limit on garrisoned land** (option D). A camp can always take
   Planetary Defense-adjacent FRONTIER, but **attacks on a House's garrisoned
   (SETTLED) tiles are limited per House per manpower window**
   (`MANPOWER_REFILL_WINDOW_MS`, 4 h). Every attack counts, won or lost. Limit:
   **10 per camp per House per window** (owner decision 2026-11-20). This
   covers the case rule 7 does not: an online neighbour wakes a camp that then
   attacks an offline House.

### Alert: a camp woke at your border

- When a camp goes from asleep to awake and its land touches, or is within 2
  tiles of, your land, you get a **prominent
  persistent alert** ("Planetary Defense camp awake at your border") with a
  locate button that jumps the camera to the camp
  (`client-persistent-alerts/`). At most one alert per camp per manpower window,
  so camps flickering awake and asleep as viewers come and go don't spam it.
- Players who were offline get it on login as a summary: which camps woke near
  them, and what they took (frontier tiles and garrisoned tiles), via the event
  log / Activity Feed.
- In-game only. The codebase has no phone push notifications today; adding
  them would be a separate project.

### What players see and do

- A **camp marker** on each camp in **both renderers** (true-3D and 2D canvas,
  branching on `isTrue3DRendererActive()`). Since camps never move, the client
  stops guessing movement by comparing redraws.
- **Soldiers only when it matters:** soldiers appear on a camp you are tracking
  (tapped / selected), and while a camp is attacking your tile or expanding
  into neutral land. Otherwise the land is plain Planetary Defense grey with
  the camp marker. Far fewer models in both renderers.
- **Tapping** a camp or any of its tiles highlights that camp's whole area
  (`campId`) in both renderers, and the tile menu names the camp and shows the
  bounty.
- Taking Planetary Defense frontier is an ordinary attack on frontier
  (`FRONTIER_ATTACK_MUSTER_COST`, manpower), as for any House's frontier.
  Taking a camp is a garrisoned fight and releases all of that camp's land.
- **Hunt Planetary Defense is removed.** It was built to chase patrols that
  walk away; camps don't move, so an ordinary attack, or a plain ADVANCE flag
  (which already treats Planetary Defense as hostile), does the job.
- **Bounty per camp:** Pacification Routines (AFC Vanguard specialization,
  `barbarianCaptureCoinBonus` / `afcPlanetaryDefenseBounty`) pays 25 Coin when
  a camp is captured; frontier pays nothing. Update the text in
  `afc-vanguard.ts` from "each of their tiles" to "each of their camps".
- **Docks:** Planetary Defense crosses water only from a camp on a captured
  dock, under normal dock rules.

## Performance: no extra load from barbarians

Today's measured costs are in `docs/barbarian-activation-plan.md`
("Performance budget"). Without a tile cap, territory can grow from 100 tiles
to about 3,000 (100 camps × 10–30 tiles), so the savings below have to cover
that.

| Cost | Today | Camps |
|---|---|---|
| "Is anyone looking?" check | every 1 s over barb tiles × all players (~0.09 ms at 100 tiles; ~2.7 ms at 3,000) | **event-driven**: each camp keeps a count of its tiles an online player or an AI can see, updated only when a player's vision of a tile changes or a camp gains/loses a tile. "Is the camp awake?" is one number check. Rebuilt on boot, not saved. |
| Planner per decision | loads every barb tile, runs the House AI's frontier scorer | looks at **one camp's** tiles with a small barbarian-only picker (below) |
| Barbarian commands | up to 100 tiles × one per 15 s | up to 100 camps × one per 15 s (same worst case) |
| Barbarian attacks | ≤ 12/min | ≤ 12/min, plus the raid limit |
| Idle re-checks | every 2 s per idle tile (`NO_COMMAND_RETRY_MS`) | a camp with no target sleeps until a tile next to it changes owner |
| Camp captured | n/a | release by `campId`, no flood fill |
| Client soldiers | 2 per visible barb tile (up to 32 tiles) | only on tracked / active camps |

Player attacks on Planetary Defense frontier are paid for in manpower, like
any frontier attack, so players' own budgets limit them.

To check before implementation: that the visibility cache
(`visibility-coverage-cache.ts`) reports every "stopped seeing" edge, not only
"started seeing" (`onFirstSeen` is documented for 0→1 edges). Gate: a bench
next to `runtime-barb-activation-vision.bench.ts` with 100 camps and 3,000
tiles must come in at or below today's numbers before merge.

## Barbarian planner rewrite

`apps/simulation/src/ai/system-job-barbarian-planner.ts` (281 lines) shrinks:

- **Remove:** erosion at the tile cap (`chooseErosion`, `lastWasErosion`,
  `UNCAPTURE_TILE`); `dockBeachLandings`; `parseEndpoints` (the planner knows
  from/to when it builds the command, so it shouldn't decode its own JSON);
  `busyTileKeys` rebuilt every call (a camp is simply busy or not).
- **Per camp instead of per tile:** cooldown, last-acted, and no-target maps
  are keyed by camp (≤ 100 entries, dropped when a camp dies; no periodic
  `cleanupState`).
- **Stop using the House AI scorer** (`chooseNextOwnedFrontierCommandFromLookup`,
  which weighs coastline discovery, food, economy and strategic resources).
  A barbarian-only picker:
  1. If an attack is allowed (12/min budget and the raid limit), attack a
     House tile next to the camp's land, preferring towns and docks.
  2. Otherwise expand into an adjacent neutral tile, preferring towns and docks.
  3. No target: the camp sleeps until a neighbouring tile changes owner.
- **Keep:** the attack budget, rest-after-settle (`barbarian-settle-relay.ts`),
  and the in-flight safety timeout.

## What gets deleted

- Walk/multiply: `applyBarbarianWalkOrMultiply`, `barbarianProgressGain`,
  `barbarianTileProgress` and its gauge, `BARBARIAN_MULTIPLY_THRESHOLD`,
  `BARB_MULTIPLIED`, `BARB_ATE_TILE` progress fields.
- Release-on-launch: `launchBarbarianAttack`, `LockRecord.barbarianLaunch`, and
  the matching branches in `runtime-lock-resolution.ts`.
- Barbarian-only beach landings (`dockBeachLandings`).
- Hunt Planetary Defense end to end: `MusterState.hunt` / `SET_MUSTER.hunt`
  (`packages/shared/src/messages/messages.ts`, gateway
  `set-muster-command-payload.ts`, `runtime-command-parsers.ts`), the hunt
  branches in `runtime-muster-tick/` (`muster-advance-fire.ts`,
  `muster-advance-clear.ts`, `muster-advance-scan.ts`,
  `muster-auto-fire-shared.ts`, `barbarianAttackInRangeResolvesAt`), and on
  the client `client-muster-hunt/`, the hunt routing in
  `client-queue-muster-dispatch.ts`, the flag action in
  `client-muster-tile-actions.ts`, and hunt labels in the muster panels, HUD v2
  and persistent alerts. Flags saved with `hunt: true` load as plain ADVANCE.
  Keep the parser tolerant of an old `hunt` field while old clients are around.
- The once-a-second seen-set scan (`computeBarbTilesSeenByAnyPlayer`), replaced
  by the event-driven per-camp count.
- The 3D overlay's movement guessing in `commit()`.
- The unused constant `BARBARIAN_CLEAR_GOLD_REWARD`.

## Balance notes

- Worldgen seeds 30 single tiles at least 4 apart and 12+ from spawns
  (`season-barbarian-seed.ts`), so a season starts with about 30 camps.
- Camps will go for towns and docks next to their land. A camp beside a cluster
  of neutral towns can chain new camps quickly; watch the early-season camp
  count on staging.
- Taking a House's town makes a camp inside that House's land. The House's
  cut-off frontier goes neutral, not to Planetary Defense (barbarian pockets
  already go neutral).

## Staged implementation

1. **Server rules** (`apps/simulation`): `campId` on tiles; FRONTIER captures;
   town/dock → camp with the camp cap; per-camp supply and release-on-capture;
   online-only waking with the event-driven count; raid limit; planner
   rewrite; delete walk/multiply, release-on-launch and Hunt (server side).
   Regression tests for each rule, plus the bench gate.
2. **Live-season migration:** today every barbarian tile is SETTLED. On boot,
   make tiles holding a town or dock, plus one tile per connected cluster, into
   camps; give the rest FRONTIER with the nearest camp's `campId`. Or ship at
   the next season reset and skip migration.
3. **Client:** camp marker, soldier display rule, tap highlight, border alert
   and login summary, all in both renderers; remove Hunt and the movement
   guessing. Changelog entry in `client-changelog-data.ts`.
4. **Docs and lore:** rewrite the barbarian bullet in `game-mechanics.md`. The
   world bible (`docs/lore/galactic-lore.md`) has no Planetary Defense entry
   today ("remnant of the planet's own defense force" exists only in code and
   `player-display-name.ts`). Add a canon entry for the defense force and its
   garrison camps in the same branch as stage 1.

## Open questions

None outstanding; all decided by the owner on 2026-11-20.
