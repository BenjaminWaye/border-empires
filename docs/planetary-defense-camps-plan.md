# Planetary Defense camps (proposal)

Status: **stages 1, 2 and 4 implemented** (server rules, live-season
conversion, docs and lore; see "Implementation status" below). **Stage 3
(client) is only started**: soldiers now stand only on camp tiles in both
renderers (`isPlanetaryDefenseCampTile`) and the client no longer offers Hunt
Planetary Defense (removed 2026-11-27 after a hunt, run as a plain Advance,
attacked a human), but there is no separate camp marker, tap highlight or camp
alert.
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
   applied per camp). When a camp falls, all of its land is released to
   neutral by `campId`, with no flood fill; the House-wide encirclement pass
   skips Planetary Defense land. A tile cut off from its camp mid-territory,
   or won by a camp that has already fallen, is released the same way.
5. **New camps come only from towns and docks.** When Planetary Defense
   captures a **town or a dock**, neutral or a House's, that tile becomes a
   new camp (SETTLED, its own new `campId`). Nothing else creates a camp, and a
   destroyed camp never comes back, so the force shrinks over a season as
   Houses clear it. At most **100 camps** (`MAX_BARBARIAN_TILES` is repurposed
   as the camp cap); at the cap a captured town or dock becomes FRONTIER. There
   is no cap on total tiles, but **each camp holds at most 20 tiles**
   (`MAX_PLANETARY_DEFENSE_CAMP_TILES`, camp included; added 2026-11-21 after
   camps swamped the map): a full camp stops expanding and stops attacking
   frontier. It still raids a House's garrisoned land (raid limit, rule 8) and
   takes towns and docks only while they found new camps (below the camp cap).
   The progress / multiply rule is removed.
6. **One action per camp at a time, then a rest.** Each camp (the camp and
   its tiles) rests `BARBARIAN_TILE_REST_MS` (15 s) after an ATTACK and
   `PLANETARY_DEFENSE_EXPAND_REST_MS` (60 s) after an EXPAND into neutral land
   (a refused one rests 15 s), counted from when the action settles. The global limit of
   `BARBARIAN_ATTACKS_PER_MINUTE` (12) stays. Since 2026-11-28 every action also **marches out
   of the camp** first: the lock is charged the walk from the camp tile to the
   launch tile, like a House's muster company, and nearby players watch the
   soldiers walk (`camp-march.ts`; `game-mechanics.md`).
7. **Only an online player wakes a camp** (option A). A camp acts only while a
   player who is **online** (map open; the simulation's `isPlayerSubscribed`)
   can see at least one of its tiles. An offline human's land never wakes a
   camp. **AI players count as always online**, so their vision always wakes
   camps (owner decision 2026-11-20).
8. **Raid limit on garrisoned land** (option D). A camp can always take
   Planetary Defense-adjacent FRONTIER, but **attacks on a House's garrisoned
   (SETTLED) tiles are limited per House per manpower window**
   (`MANPOWER_REFILL_WINDOW_MS`, 4 h). Every attack counts, won or lost. Limit:
   **3 per camp per House per window** (owner decision 2026-11-21; was 10).
   A camp founded during a House's window gets **no raids on that House until
   its next window** (owner decision 2026-11-21): otherwise each camp born from
   a captured town added a fresh allowance and the raids compounded. The
   founding time is saved in the planner snapshot. This covers the case rule 7
   does not: an online neighbour wakes a camp that then attacks an offline House.

### Alert: an active camp in your vision

- When a camp is **active and any of its tiles is in your vision**, you get a
  **prominent persistent alert** ("Planetary Defense camp active near you")
  (owner decision 2026-11-20). It fires on whichever happens second: the camp
  wakes while you see one of its tiles, or your vision reaches a tile of an
  already active camp. Both moments are visible to the server (the awake count
  crossing zero, a coverage edge), but the per-player alert event built on them
  is not written yet; it should cost one check per event, with no scanning. The alert has a
  locate button that jumps the camera to the camp
  (`client-persistent-alerts/`). At most one alert per camp per player per manpower window,
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

Checked: coverage only crosses zero in two places (`addFootprint`,
`removeFootprint`), now in `visibility-coverage-raster.ts` with an
`onCoverageEdge` hook on both. The awake counts are re-derived every 5
minutes and any drift is counted (`sim_barbarian_camp_awake_drift_total`).

Gate (`planetary-defense-camps/camp-awake.bench.ts`, 25 AI empires x 1,500
tiles plus 100 camps x 30 tiles, all awake; dev container, mean):

| Measure | Old (100 tiles) | Camps (3,000 tiles) |
|---|---|---|
| "Is anyone looking?" | ~0.09 ms per 1 s scan | ~0.0003 ms per lookup, no scan |
| One planner decision | ~0.36 ms (worker thread) | ~0.07 ms (main thread) |
| 1 s side tick (watcher sync, nobody logging in/out) | n/a | ~0.002 ms |

**Planned on the main thread.** The worker only knew the tiles near
barbarian land when it started plus what changed since, and keeping it in
sync re-exported the barbarian's whole territory on every change (the reason
for the old 100-tile cap). One camp's decision reads a few hundred tiles
straight from the runtime, so both system producers now call the planner
through `runtime-barbarian-planner-bridge.ts` and the barbarian is never
synced to the worker. The producer issues at most one command per 500 ms
tick, so camps make at most about two decisions a second (~0.07 ms each, timed
as `system_barbarian_choose`), and the O(territory) re-export, the seen-set
posting and the worker-side barbarian tile copy are gone.

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

## Implementation status

Built, with tests (`apps/simulation/src/planetary-defense-camps/`, planner and
producer tests in `ai/`):

- `campId` on tiles through save, event replay, proto (`camp_id = 39`),
  gateway and tile deltas; `withoutStrayCampId` strips it from any tile
  Planetary Defense no longer owns.
- Capture rules (`camp-rules.ts`, `runtime-winning-capture.ts`,
  `runtime-lock-resolution-lost-origin.ts`), camp index and collapse
  (`camp-index.ts`, `camp-supply.ts`, `camp-runtime.ts`), awake counts
  (`camp-awake-tracker.ts`), planner (`ai/system-job-barbarian-planner.ts`),
  boot conversion (`camp-migration.ts`), bounty per camp, metrics.
- Deleted: walk/multiply and release-on-launch (`runtime-barbarian-walk.ts`),
  the seen-tile scan (`runtime-barb-activation-vision.ts`), the worker's
  barbarian planner, Hunt on the server (the `hunt` field is accepted and
  ignored).
- Docks: a camp on a dock crosses like any House's dock (linked docks and
  their landing ground); nothing barbarian-only remains.
- After review: rejected attacks refund the budget and raid and the target is
  avoided for 60s; the boot conversion is persisted as an event; a tile won
  after its camp fell collapses; landmark tiles share `campId`; camp rest and
  raid counts are saved in snapshots (`planetaryDefensePlanner`; a rest is
  clamped to one full rest on restore; a crash loses what changed since the
  last snapshot, and a command in flight at restart sets no rest); the
  per-fight change report is re-derived at resolution, so it matches the
  capture at the camp cap.

Not built:
- Stage 3 (client): soldiers stand only on camps (not yet on a tracked camp's
  land or while a camp expands); no separate camp marker or tap highlight in
  either renderer. Hunt was removed from the client on 2026-11-27 (flag
  action, the attack-to-hunt routing and the hunt labels).
- The alert and login summary need server work too: an event when a camp
  becomes active in a player's vision, and a record of what a camp took from
  a House while it was offline. Neither exists yet.

Known follow-ups (accepted for now):
- A camp's size was first left unbounded; since 2026-11-21 it is capped at
  `MAX_PLANETARY_DEFENSE_CAMP_TILES` (20). The cap stops growth but does not
  shrink a camp that is already larger (boot migration can hand a camp a whole
  legacy cluster), and each decision still walks every tile of the camp. A full
  camp can still grow by its raids on garrisoned land, which the raid limit
  bounds.
- A collapsing camp drops buildings it captured (forts, observatories), as the
  old walk release did; keeping barbarian-owned structures on neutral ground
  needs its own rule.
- Admin live seeding (`runtime-live-barbarians.ts`) does not check the camp cap.
- Pre-existing vision drift, separate PR: removing a vision footprint
  recomputes its cells from live terrain, so a mountain removed (or forest
  cleared) in range between add and remove leaves cells counted wrongly, and a
  newly raised mountain does not block existing vision until those sources
  change. This affects all fog edges, not only camps (camp awake counts
  self-heal through the 5-minute verify). The fix is to refresh the vision
  sources in range at the three terrain-changing sites (CREATE_MOUNTAIN,
  REMOVE_MOUNTAIN, AFC forest clearing); a per-contribution ledger was tried
  and reverted (memory cost, reason-key collisions, still stale vision).

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
