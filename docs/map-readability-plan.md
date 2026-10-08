# Map Readability: Telling Your Land From Your Neighbour's

Status: active proposal
Owner: Benjamin Waye (product decisions); implementing agent per workstream
Last verified: 2026-10-08
Replaces: none. When delivered, the rules move into `game-mechanics.md` and this plan is archived.

## Problem

A player who spawns next to another empire cannot tell where their own
territory ends and the neighbour's begins. Reported on 2026-10-08 with a 3D
screenshot showing four outline colors (cyan, pale green, dark blue, orange),
two fill styles, and nothing marking which land is "you". Four causes stack
up:

1. **Reach swallowed the spawn.** Reach is first-come
   (`grantAnchorToBorder` in `packages/shared/src/reach/reach.ts`). An AFC
   whose radius-3 disk lands on a rival's reach auto-claims only the tiles
   nobody else's reach covers, which can be none of them. Tiles inside the
   rival's reach that nobody owns stay neutral and untinted. The player can't
   claim them, and nothing on the map says why.
2. **Vision followed owned land.** Territory vision reaches one tile past
   owned land or the player's own reach, so a swallowed spawn saw almost
   nothing around its AFC.
3. **Spawn placement ignored reach.** The search only measured distance to
   *owned* tiles. The crowded-map fallbacks (0-tile distance) and rally spawns
   (3 tiles from the inviter) could land a spawn on a rival's reach.
4. **"Unique" colors only compared exact hex.** The gateway allocator
   (`apps/realtime-gateway/src/player-color-allocation/player-color-allocation.ts`)
   treats a color as taken only on an exact hex match. `BASE_PALETTE` holds
   about a dozen blues (`#1f77b4`, `#03a9f4`, `#2196f3`, `#0082c8`, `#0067a5`,
   `#40a5e7`, `#5f9ed1`, `#3f51b5`, `#17becf`, ...), so two neighbours can both
   be "blue".

## Decisions already made

- **Reach is not re-claimed after the fact.** Tiles inside reach that later go
  neutral (decayed or abandoned) stay neutral. Re-claiming them would stop
  barbarians growing into captured reach.
- **A spawn is never refused.** A full map relaxes placement instead and
  raises a "map nearly full" warning so the next season's world can be sized
  up.
- **3D first.** The overlay work ships on the true-3D renderer first. The 2D
  renderer follows later, and each 3D-only PR must say plainly that 2D is
  missing (`AGENTS.md` renderer-parity rule).

## Proposed change

Four workstreams, landed as separate PRs in this order.

### 1. Spawn placement and starting vision (server). In review as PR #2274

- Every spawn search pass except the last keeps the AFC's reach disk plus one
  ring (`SPAWN_RIVAL_REACH_CLEARANCE` = 4) clear of other players' reach, rally
  spawns included. Rival reach outranks barbarians: a landing wipes
  barbarians, but nothing frees a rival's reach.
- When only the last pass can place a spawn, the simulation logs
  `spawn_map_nearly_full`.
- A landed AFC (`afc.landedAt`, set by the spawn and respawn paths and
  stripped on capture) always keeps its 3x3 footprint as reach
  (`ReachAnchor.guaranteedRadius`). The rule depends only on position, so the
  boot reseed reproduces it in any anchor order, and a captured AFC never
  gains it.
- Every owned AFC sees `AFC_VISION_RADIUS` (4) around itself.

### 2. Colors that look different (gateway)

- Replace the exact-hex "taken" test with a perceptual distance (OKLab ΔE or
  CIEDE2000) and a minimum-gap threshold. Use it for automatic assignment
  (`assignUniqueColor`), suggestions (`pickSuggestedPalette`) and player picks
  (`SET_TILE_COLOR` / `SET_PROFILE` collision rejection).
- Prune `BASE_PALETTE` so no two entries fall under the threshold. Order it
  so hash-picked colors spread around the hue wheel.
- Open question: whether existing players' colors get re-assigned at season
  rollover, or only new picks are checked.

### 3. 3D reach and ownership overlay (client, 3D first)

The visual rule: **color is for ownership; line style and pattern are for
reach.**

- **Owned land.** A fill in the owner's color: solid for SETTLED, lighter for
  FRONTIER (as today).
- **Your own territory.** A border that does not depend on color, such as a
  thick bright or gold edge that no other player ever gets, so you can always
  find yourself even beside a similar color.
- **Unowned tiles inside a rival's reach.** Faint diagonal hatching in that
  rival's color. This is the "his reach, not his land" state that currently
  draws nothing. Data comes from `tile.reachOwnerId`, which the wire already
  carries (`client-reach-overlay-all-owners`).
- **Clashing reach.** Rework the seam drawn where two empires' reach meet
  (`client-reach-overlay-border-contact`). The current white border is not
  clear enough. Replace it with something that reads as two distinct sides,
  for example each side's own color meeting at the seam.
- **Tile dialog.** Tapping a tile inside another player's reach opens the
  tile dialog headed **"Inside <player>'s reach"**, with the available expand
  options at the top. Tiles you own say "Yours"; tiles another player owns
  say "Owned by <player>".
- Design sign-off first, through a Storybook story on the real 3D renderer.
  No mockup-only stories.

### 4. "Who owns what" map view (client)

- A toggle or hold-key lens that flattens the map to political colors: **you
  in green, everyone else in red**, with empire names labelled over their
  territory at zoomed-out levels.
- Open question: whether allies get a third color (e.g. blue) or count as
  "everyone else".

## Acceptance criteria

- A new or respawning player never starts with a reach disk covered by
  another empire while open ground clear of reach exists. When none exists,
  `spawn_map_nearly_full` is logged and the AFC still holds its 3x3.
- A new player sees at least 4 tiles around their AFC.
- No two active players' colors fall under the perceptual threshold.
- On the 3D map, a player can tell, without opening any dialog: their own
  land, a rival's land, and unowned ground inside a rival's reach.
- Tapping unowned ground inside a rival's reach states whose reach it is.
- The 2D renderer gap is listed in every 3D-only PR until 2D catches up.

## Verification

- Workstream 1: regression tests in
  `apps/simulation/src/spawn-placement/spawn-placement-rival-reach.test.ts`
  and `apps/simulation/src/runtime/runtime-afc-crowded-spawn.test.ts`
  (both added by PR #2274, which also documents the rules in
  `game-mechanics.md`).
- Workstream 2: allocator unit tests, including a case where two near-identical
  blues are rejected.
- Workstreams 3–4: Storybook stories on the real renderer, plus a
  screenshot check of a two-empire border in the browser preview.
- On delivery of each workstream, update `game-mechanics.md` (or the client
  docs it links to). Archive this plan once all four have shipped.
