# Planetary Defense camps (proposal)

Status: **proposal, rules agreed with the owner 2026-11-20; not implemented.**
Replaces the barbarian walk/multiply model described in
[`game-mechanics.md`](game-mechanics.md) (the "Barbarians (rewrite model)"
bullet) once built. Delete or fold into `game-mechanics.md` when shipped (see
[`README.md`](README.md) lifecycle policy).

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

**Planetary Defense plays by the same territory rules as a House**, with three
differences: it has no economy, it takes one action per camp every 15 s, and
it only acts where someone can see it.

1. **Camp = a SETTLED Planetary Defense tile.** Every SETTLED tile it owns is a
   camp. Camps never move.
2. **Frontier spreads from camps.** Planetary Defense captures become
   **FRONTIER**, exactly as a House's do (today they are hard-coded to SETTLED in
   `runtime-winning-capture.ts`).
3. **Reach.** A camp projects reach like a town (`TOWN_REACH_RADIUS`, 3,
   land-gated). Planetary Defense may EXPAND/ATTACK only onto tiles inside its
   camps' reach, so each camp holds a small area around itself instead of
   spreading without limit. *(Default chosen by the agent; owner did not
   object.)*
4. **Encirclement applies.** Planetary Defense FRONTIER must connect to a camp
   through its own frontier, under the normal encirclement rule. Destroying a
   camp collapses the frontier it supported. Remove the barbarian exemptions in
   stranded-frontier / encirclement handling.
5. **New camps come only from towns and docks.** When Planetary Defense
   captures a **town or a dock**, neutral or a House's, that tile becomes a
   new camp (SETTLED). Nothing else creates a camp, and a destroyed camp never
   comes back (owner decision 2026-11-20), so the force shrinks over a season
   as Houses clear it. **The progress / multiply rule is
   removed** (`barbarianTileProgress`, `BARBARIAN_MULTIPLY_THRESHOLD`, +1/+2
   gain, `BARB_MULTIPLIED`, `BARB_ATE_TILE` progress fields).
6. **Action budget.** Each camp, together with the frontier connected to it,
   takes at most one action (EXPAND or ATTACK) per 15 s
   (`BARBARIAN_TILE_REST_MS`), measured from when the action settles, as today.
   The action may launch from any tile in that camp's group.
8. **Camps don't move through each other** (owner decision 2026-11-20). Every
   Planetary Defense frontier tile belongs to exactly one camp: the nearest
   camp (land-gated steps) whose reach covers it, ties to the lower tile key.
   This is derived from positions each time, not saved. A camp acts only from
   its own tiles and only into its own reach, so it can never use another
   camp's land as a road to ground beyond it. Supply is per camp too: when a
   camp falls, its frontier collapses, except tiles that lie inside a surviving
   camp's reach and connect to that camp, which simply become that camp's.
   Two camps can't attack each other (same owner).
7. **Wake when seen** stays: a camp's group acts only while a non-barbarian
   player can see at least one of its tiles. This keeps the server cheap and
   means no camp grows while everyone nearby is offline (core pillar 3). The
   global cap of `BARBARIAN_ATTACKS_PER_MINUTE` (12) stays for server cost.
   *(Default chosen by the agent.)*

### What players see and do

- A **camp overlay** marks each camp in **both renderers** (true-3D and 2D
  canvas, branch on `isTrue3DRendererActive()`). Patrol soldiers stand on
  camps; frontier tiles may show a lighter presence. Since camps never move,
  the client stops guessing movement by comparing redraws.
- Taking Planetary Defense frontier is cheap, as with any frontier. Taking a
  camp is a SETTLED fight and collapses the frontier that camp supported.
- **Hunt Planetary Defense is removed** (owner decision 2026-11-20). It was
  built to chase patrols that walk away; camps don't move, so an ordinary
  attack, or a plain ADVANCE flag (which already treats Planetary Defense as
  hostile), does the job.
- **Bounty is paid per camp, not per tile** (owner decision 2026-11-20).
  Pacification Routines (AFC Vanguard specialization,
  `barbarianCaptureCoinBonus` / `afcPlanetaryDefenseBounty`) pays when a camp
  is captured. Taking Planetary Defense frontier pays nothing. The amount stays
  25 Coin (owner decision 2026-11-20); update the specialization text in
  `afc-vanguard.ts` from "each of their tiles" to "each of their camps".

## What gets deleted

- Walk/multiply: `applyBarbarianWalkOrMultiply`, `barbarianProgressGain`,
  `barbarianTileProgress` and its gauge, `BARBARIAN_MULTIPLY_THRESHOLD`.
- Release-on-launch: `launchBarbarianAttack`, `LockRecord.barbarianLaunch`, and
  the matching branches in `runtime-lock-resolution.ts`.
- Barbarian-only beach landings (`dockBeachLandings` in the barbarian planner).
  Planetary Defense crosses water only from a camp on a captured dock, under
  normal dock rules (owner decision 2026-11-20).
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
  Keep the parser tolerant of an old `hunt` field so old clients aren't
  rejected while the release rolls out.
- The unused constant `BARBARIAN_CLEAR_GOLD_REWARD` in `packages/shared/src/config.ts`.
- The territory cap's shedding of unseen tiles (`UNCAPTURE_TILE` erosion). The
  cap becomes a limit on the number of camps: `MAX_BARBARIAN_TILES` (100) is
  reused as the camp cap (owner decision 2026-11-20). At the cap, a captured
  town becomes FRONTIER instead of a camp.
- The reach exemption for barbarians in `runtime-reach-anchors.ts` is narrowed:
  camps are anchors. The original reason for the exemption (a captured town
  stealing a fresh spawn's reach) is still covered by AFC landing clearing
  barbarians within its reach disk and by `SPAWN_RIVAL_REACH_CLEARANCE`. Check
  that both treat camps as rival reach.

## Balance notes

- Worldgen already seeds 30 single tiles at least 4 apart and 12+ from spawns
  (`season-barbarian-seed.ts`), so the season starts with about 30 camps.
- Frontier scoring already adds +1000 for a town, so camps will go for towns in
  reach. Growth is limited by how many towns lie within 3 tiles of a camp's
  reach. Camps are capped at 100 (the old tile cap). Watch the early-season camp
  count in staging: a cluster of neutral towns near a camp can chain new camps
  quickly, and the cap is the only brake besides players.
- Taking a House's town makes a camp inside that House's land. Encirclement
  makes the House's cut-off frontier go neutral, not to Planetary Defense
  (barbarian pockets already go neutral). That stays.

## Staged implementation

1. **Server rules** (`apps/simulation`): FRONTIER captures, town → camp, camp
   reach anchor + reach-gated targets, encirclement for barbarian frontier,
   per-camp action groups in `system-job-barbarian-planner.ts`, delete
   walk/multiply and release-on-launch. Regression tests: capture yields
   FRONTIER; town capture yields SETTLED camp; no camp from non-town captures;
   a camp's group acts at most once per rest; frontier collapses when its camp
   falls; no target outside reach.
2. **Live-season migration**: today every barbarian tile is SETTLED. On boot,
   keep tiles holding a town plus one tile per connected cluster (the
   seed-like centre) as camps and convert the rest to FRONTIER. Alternatively,
   ship at the next season reset and skip migration.
3. **Client**: camp overlay in 3D and 2D, remove the movement guessing in
   `commit()`, remove Hunt Planetary Defense (server side goes in stage 1),
   tile menu labels a camp and shows the camp bounty.
   Changelog entry in `client-changelog-data.ts`.
4. **Docs and lore**: rewrite the barbarian bullet in `game-mechanics.md`. The
   world bible (`docs/lore/galactic-lore.md`) has no Planetary Defense entry
   today ("remnant of the planet's own defense force" exists only in code
   comments and the display-name file). Add a canon entry for the defense
   force and its garrison camps in the same branch as stage 1.

## Open questions

None outstanding; all decided by the owner on 2026-11-20.
