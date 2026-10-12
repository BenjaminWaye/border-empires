# River mountains and mountain variety plan

Status: **shipped to develop (2026-10-12)**. A, B and C landed together in
#2300 (with #2296 and #2298); D landed in #2299 as worldgen **v11**. What
was actually built differs from the design below in several places -- read
"As built" first; "What remains" lists the open items. Owner decisions are
at the end. Extends [`rivers-remake-plan.md`](rivers-remake-plan.md)
(it delivers that plan's Phase 3 "rapids where a river leaves high ground"
and adds a headwater rule to its Phase 2). Replaces no document; when it
ships, fold the durable facts into the rivers plan and delete this file.

## Goal

Rivers today begin abruptly on open grass: the water ribbon ends in a flat
cut, the first stretch runs dead straight along the tile grid, and nothing
nearby says why the river starts there. Mountains are a row of identical
cones. This plan:

1. makes mountains varied and readable as ranges (both renderers);
2. gives every river head a real start -- a small spring pool with a
   rounded, fading tip (both renderers);
3. adds a **river mountain**: a mountain tile whose face carries a cleft and a
   cascade that runs down into the river's spring pool (both renderers);
4. in the next worldgen version, starts rivers at mountains on purpose, so
   most rivers get a river mountain.

Rivers stay purely visual (rivers plan decision 3). The river mountain is
**not** a new terrain type: the tile stays `MOUNTAIN` for gameplay, the
server, the wire protocol and the AI. The client derives it from the river
paths.

## How it works today (verified in code)

- **Mountain 3D.** Two layers. The heightfield lifts mountain tiles
  (`HEIGHTFIELD_MOUNTAIN_ELEVATION` 1.15; shared edges of adjacent mountains
  rise to a ridge, a lone mountain swells only ~25%,
  `client-map-3d-heightfield.ts`). On top, every mountain tile gets the same
  instanced massif -- hex rock base, 4-sided peak, snow cap, all with one
  fixed rotation and size (`client-map-3d-mountain-massif.ts`, wired in
  `client-map-3d.ts` L148 / L1028 / L1302).
- **Mountain 2D.** `drawReliefMountainTile`
  (`client-map-render-relief-mountain.ts`) draws a stylised block with one
  peak; only the peak offset varies per tile (`mountainPeakOffset`).
- **River source placement (v9).** `findEdgeRiverStart`
  (`worldgen-rivers-edge.ts`) picks a LAND tile within 2 tiles of a mountain
  (`NEAR_MOUNTAIN_RADIUS = 2`), then whichever of its corners is farthest from
  the sea. A river corner must be *clear*: none of the 4 tiles around it may be
  a mountain or hills tile (`buildClearCornerMask`), because the client replaces
  every tile touching a river corner with a carved valley patch
  (`client-map-3d-heightfield-river-mask.ts`, `client-map-3d-river-valley.ts`),
  which it can't do for massif/dome tiles. So a v9 river can never start *on*
  a mountain -- at best one tile away.
- **River head rendering.** `channelCenterline` narrows the first 1.5 tiles
  from 35% width (`SOURCE_TAPER_LENGTH`, `client-map-3d-rivers-channel.ts`)
  and zeroes the wobble at the first point. `appendWater` emits a strip, so
  the water ends in a straight cut. (The trench under it already ends round:
  `riverTrenchDepth` uses the distance to the nearest segment, which clamps to
  the endpoint.) 2D draws axis-aligned rectangles per tile edge
  (`client-map-render-river-edges.ts`) with square ends.
- **Live versions.** Staging season is v9, prod season is v8 (tile-centre
  rivers). `CURRENT_WORLDGEN_VERSION = 9`. Seasons keep their stamped version,
  so a v10 change only affects new seasons.
- **Mountains can disappear at runtime**: AFC join-drop footprints hold
  mountains only until the drop lands (`terrainWithAfcLandingHold`,
  `client-map-3d.ts` L353). Anything keyed on "this tile is a mountain" must
  read live terrain at render time.

## Definitions

- **River head**: the first point (`path[0]`) of a v9+ edge river path -- a
  tile corner.
- **Headwater corner**: a clear corner C with a mountain tile M in the ring
  just outside it, i.e. M touches one of C's four neighbouring corners. C stays
  clear (so the valley/mask invariant holds); the gap between M and C is
  ~1-1.6 tiles from M's centre, covered by the cascade.
- **River mountain**: a mountain tile M that is the nearest mountain to a
  river head that is a headwater corner. Ties break by a fixed corner order so
  the choice is deterministic. One river mountain per river at most.

## PR sequence

| PR | Scope | Packages | Depends on | Ships to |
| --- | --- | --- | --- | --- |
| A | Mountain variety | client | -- | every version (prod too) |
| B | River heads: shared helper + spring pools | shared (read-only helper), client | -- | v9+ seasons (staging now) |
| C | River mountain variant | client | A, B | v9+ wherever a head is already a headwater corner |
| D | Worldgen headwater rule | shared (+ worldgen-lab) | B's helper | new seasons only (v10) |

A and B touch different files and can run in parallel. C waits for both.
D can be built any time after B but must merge before the season it targets
is created.

Every PR: both renderers in the same branch (AGENTS.md renderer parity --
grep `isTrue3DRendererActive()` before calling it done), tests beside the
module, a changelog entry for user-visible changes, and `client-map-3d.ts`
(1688 lines) and `client-map-render.ts` (818 lines) must end net smaller
(extract first; never compact in place).

## PR A -- mountain variety

### 3D (`client-map-3d-mountain-massif.ts`)

1. `addInstance` takes the world tile (`wx`, `wy`) as well as the scene
   position, plus a `MountainContext` (orthogonal mountain neighbours N/E/S/W
   and whether the tile is in a cold biome). Variation comes from an integer
   hash of world coords only (`Math.imul`-based, same style as rivers plan
   2.1), so a tile looks the same wherever the camera is and never flickers on
   pan.
2. Per-tile variation:
   - peak yaw: any angle (the 4-sided peak repeats every 90 degrees);
   - height scale 0.8-1.3, footprint 0.9-1.1; interior tiles of a range (2+
     mountain neighbours) get a height bonus so ranges have a spine;
   - rock tint: per-instance colour (`setColorAt`), +-6% lightness, slight
     warm/cool shift;
   - snow cap only when the peak is tall enough or the tile is cold (TUNDRA
     / SNOW visual biome); scaled with the peak. The snow mesh keeps its own
     instance count.
3. Secondary peaks: ~45% of tiles get a second, smaller peak offset 0.2-0.3
   tile from the first. Ridges: for each mountain tile with a mountain
   neighbour to the E or S (each pair counted once), a low saddle peak at the
   shared edge's midpoint, stretched along it, on top of the heightfield ridge
   that's already there.
4. No extra draw calls: secondary and saddle peaks reuse the peak
   `InstancedMesh`, whose capacity grows to `4 * maxInstances` (per tile at
   most 1 main + 1 secondary + 2 saddles, E and S; `addInstance` still drops
   anything past capacity, as today).
5. Wiring: extract the mountain block of `rebuildVisibleTerrain`
   (`client-map-3d.ts` ~L1028) and the massif lifecycle into
   `client-map-3d-mountain-wiring.ts`, which builds the `MountainContext` from
   the same live terrain lookup (`terrainForWorldTile`). `client-map-3d.ts`
   gets smaller.

### 2D (`client-map-render-relief-mountain.ts`)

1. Move the mountain branch of `drawTerrainTile` (`client-map-render.ts`
   ~L238) into the relief-mountain module first, so `client-map-render.ts`
   shrinks and the new options don't land there.
2. Same hash function (shared client helper, not the `Math.sin` one) for:
   peak height, a twin peak on the same ~45% of tiles as 3D, snow only on tall
   or cold peaks, and a ridge shoulder drawn toward each mountain neighbour so
   ranges read as connected.

### Tests and acceptance

- Same `(wx, wy)` gives the same transform for different camera origins.
- Snow count <= peak count; total instances never exceed capacity.
- Saddles: one per adjacent pair, none for lone mountains.
- 2D: hash parity with 3D for twin-peak and snow decisions.
- Screenshots at close/mid/far zoom, both renderers: a lone mountain, a
  2-tile pair and a range of 5+. Frame time unchanged with a range in view on
  a mid-range phone.
- Changelog entry.

## PR B -- river heads (spring pools)

### Shared helper (read-only, no worldgen output change)

New `packages/shared/src/worldgen/worldgen-river-heads.ts` (keeps
`worldgen-rivers.ts` small):

```ts
type RiverHead = {
  readonly corner: { readonly x: number; readonly y: number };
  readonly heading: { readonly dx: number; readonly dy: number }; // first edge
  readonly mountain: { readonly x: number; readonly y: number } | null; // static worldgen terrain
};
riverHeadsForCurrentSeed(): ReadonlyMap<number /* corner index */, RiverHead>
```

- v9+ only (empty for v1-v8 centre rivers). Memoised with the same
  seed + version key as `riversForCurrentSeed`; one entry per river, so it
  stays bounded (state-and-persistence discipline: one seed cached).
- `mountain` is set when the head is a headwater corner (definition above).
  Static worldgen terrain only; the client re-checks live terrain.

### 3D

1. `appendSpring` (new, beside `appendEstuary` in
   `client-map-3d-river-edge-water.ts`): a small round pool at each river head,
   radius ~0.2 tile with a slight irregular rim (two or three low harmonics
   seeded by the river's `phase`), river water colours (core in the middle,
   shallow/edge band at the rim), same material, render order and
   explored/fog rules as the channel water (`riverSampleSides` /
   `riverSampleFogged` at the corner).
2. The channel starts inside the pool: taper floor drops from 0.35 to ~0.15,
   and the first ~0.15 tile is under the pool, so there is no visible cut.
   Wobble fades in from the first point instead of being zero there.
3. Wet-bank ring around the pool (`client-map-3d-river-bank-strip.ts`), so the
   territory tint stops at the pool's bank the same way it does along the
   channel.
4. Valley: deepen the trench under the pool into a shallow bowl
   (`riverTrenchDepth` also takes the head points). Optional -- the rivers plan
   1b removes the trench; the pool must look right without it.

### 2D (`client-map-render-river-edges.ts`)

Each of the 4 land tiles around a head corner draws its quarter of the pool
(circle clipped to the tile rect, bank colour then water colour) and a round
cap on the river edge ending there. Drawn in the same pass as the existing
edges, including the after-ownership-tint redraw.

### Tests and acceptance

- Helper: synthetic paths -> one head per river; `mountain` set only for
  headwater corners; empty for v8.
- 3D: spring vertices lie on the water surface; pool only at path index 0;
  pool hidden when its corner's tiles are unexplored, faded when fogged.
- 2D: the four tiles around a head together cover one full pool.
- Screenshots: a head on open grass (the original report), inside territory,
  at a fog edge.
- Changelog entry.

## PR C -- river mountain

### Which mountains

At render time a river mountain is `head.mountain` **only if** that tile is
still `MOUNTAIN` in live terrain (AFC drops can remove it). Otherwise the head
falls back to a plain spring from PR B. No version gate: v9 heads are picked
within 2 tiles of a mountain, so some are likely already headwater corners and
staging would get river mountains right away (count them on the staging seed
first); v10 (PR D) makes them the norm.

### 3D

1. **Massif variant** (`client-map-3d-mountain-massif.ts`, via the wiring
   from PR A): the river mountain's peak yaw is fixed so a face points at the
   head corner (overrides the random yaw), and a dark rock cleft -- a narrow
   wedge instance, its own small `InstancedMesh` -- is set into that face from
   about half height down to the rock base.
2. **Cascade** (new `client-map-3d-rivers/client-map-3d-river-cascade.ts`):
   a narrow ribbon from the cleft down the massif face, over the rock base,
   then draped on the heightfield slope (`heightfieldSurfaceY`, which already
   rises toward the mountain's corners) to the spring pool. Width ~0.06 tile at
   the top widening to the channel's head width. Pale, foamy water colour on
   the steep part blending to the river core colour at the pool. Flow
   animation: UV scroll along the ribbon, driven by the frame clock the ocean
   waves already use -- never sampled inside `rebuildVisibleTerrain` (which
   also runs on camera pan).
3. **Splash**: a brighter foam ring on the pool where the cascade lands,
   plus 2-3 small low-poly boulders (one shared `InstancedMesh`) at the pool
   edge on the mountain side.
4. Same culling as the channel: the cascade is drawn only when the mountain
   tile and the head's tiles are explored; fog darkens it like the ground.

### 2D

`drawReliefMountainTile` takes an optional `riverFace` (which side or corner
the head is on). It draws the cleft as a dark notch in the peak on that side
and a light-blue/white falling stream from the notch to the tile edge toward
the head corner; the in-between land tiles draw the stream's continuation as
a short rapids stroke along their shared edge into the PR B pool.

### Tests and acceptance

- Live-terrain fallback: head with `mountain` set but the tile no longer a
  mountain -> spring only, no cleft, no cascade.
- Massif yaw for a river mountain faces the head corner (all 8 head
  positions around the ring).
- Cascade bottom vertex coincides with the pool rim; draped vertices match
  `heightfieldSurfaceY` for a synthetic `cornerYAt`.
- 2D: notch + stream drawn only on the river mountain, toward the right side.
- Screenshots: a v9 staging river that already starts next to a mountain,
  close and mid zoom, both renderers. Cascade animation visible in a short
  recording.
- Changelog entry.

## PR D -- worldgen headwater rule (v10)

Start rivers at mountains on purpose. Gated on the new version; v1-v9 paths
must stay byte-identical.

### If it ships with rivers plan Phase 2 (one v10) -- preferred

Add to Phase 2.3 (flow accumulation): every headwater corner gets extra
inflow ("snowmelt", tuned in worldgen-lab), so the trunk of most river systems
begins at a headwater corner, while tributaries can still begin anywhere their
flow crosses the threshold (those get plain springs). Uses Phase 2.1's integer
hash.

### If Phase 2 is not ready for the next season -- standalone v10

Bump `CURRENT_WORLDGEN_VERSION` to 10 and change only the start pick in
`worldgen-rivers-edge.ts`:

1. Candidates are headwater corners only (clear corner, mountain in the ring
   just outside), still preferring the farthest from the sea
   (`MIN_RIVER_START_DISTANCE_TO_SEA`).
2. Prefer the first edge that heads away from the mountain (score bonus, not
   a hard rule), so cascade and channel read as one line.
3. If a world has too few headwater candidates to reach
   `RIVER_COUNT_TARGET`, fill the rest with the v9 rule (those heads become
   springs). No world ends up with fewer rivers than v9.
4. New random draws use an integer hash (rivers plan 2.1), not `seeded01`.
   Phase 2 then becomes v11.

Either way: rivers feed town placement (35% of towns along rivers,
`packages/game-domain/src/server-worldgen-towns.ts`), so v10 moves towns.
That's accepted for a new season, and checked below.

### Tests and acceptance

- v9 snapshot: fixed seeds -> stored path hash unchanged.
- v10: every head is a clear corner (valley/mask invariant); share of heads
  that are headwater corners >= 80% on the default world (target, tuned in
  worldgen-lab); river count >= v9 for the same seed; every walk still reaches
  the sea.
- worldgen-lab before/after: river count and length, town distribution, fair
  spawn sites (`server-worldgen-fair-spawn-sites.ts`) still pass, generation
  time on the default world within the rivers plan 2.7 budget.
- Changelog entry (visible from the next season).

## Later

Once the rivers plan 1b (draped ribbon) removes the valley patches and the
heightfield river mask, the clear-corner rule can relax (rivers plan Phase 3).
Then a head can sit on the river mountain's own corner and the cascade
shortens to just the massif face. Lake outlets could reuse the spring pool.

## As built (2026-10-12)

The sections above are the original design. What shipped:

- **A -- mountains (3D), authored models, not a varied cone.** After several
  rounds of owner review, each mountain tile is one of six hand-specified
  low-poly models (`client-map-3d-mountain-models.ts`): 3-4 sharp,
  straight-sided, faceted peaks packed together in dark blue-grey slate, so
  neighbouring tiles mass into one jagged range. Every peak is broadest at
  its base (a test enforces it; anything wider above reads as a boulder).
  Placement (`client-map-3d-mountain-massif.ts`): a tile higher than its
  orthogonal mountain neighbours (by hash) is a *summit* and gets a tall
  model, the rest of a range a lower *filler* one; yaw, height, footprint and
  tint come from `client-map-mountain-variation.ts`, keyed on world coords.
  Unindexed geometry with one flat colour per facet, matte Lambert, cast but
  no self shadows. Snow is a shader cap on the upper, flatter facets: every
  mountain in cold country, and about two thirds of summit tiles elsewhere
  (`SUMMIT_SNOW_SHARE`); filler stays bare. No secondary/saddle peak
  instances -- the models carry their own sub-peaks. Terrain under mountains
  is only slightly raised (`HEIGHTFIELD_MOUNTAIN_ELEVATION` 0.3).
- **A -- mountains (2D).** Per-tile peaks (`client-map-render-mountain-
  peaks.ts`) using the same variation, over a plain rock texture; the
  mountain branch moved out of `client-map-render.ts` into
  `client-map-render-relief-tile.ts`.
- **B -- spring pools.** As planned: `riverHeadsForCurrentSeed`
  (`worldgen-river-heads.ts`, with `worldgen-river-headwater.ts`), a pool and
  bank ring at every v9+ river head in 3D, quarter pools per tile in 2D.
- **C -- river mountains (3D): the river wells up at the mountain's base.**
  No cleft, gully or cascade on the rock (owner: "it is enough that the
  river flows from its base"). `client-map-3d-river-cascade.ts` finds where
  the drawn model meets the ground on the side facing the river head
  (`mountainPlacementAt` + `mountainModelHeight`, so it follows the model
  actually placed), puts two boulders there and runs a meandering stream to
  the spring pool: white water where it emerges, ripples moving downstream,
  never uphill, splash ring and boulders at the pool. The instanced models
  can't be cut, so the stream sits in a shallow channel of low banks
  (`client-map-3d-river-cascade-banks.ts`: tan earth like the main rivers'
  banks, slate where they touch rock). The route
  (`client-map-river-cascade-route.ts`) is shared with the forest filter so
  trees keep off the stream.
- **C -- river mountains (2D).** As planned: a notch and a short stream on
  the mountain tile plus a rapids band along the cascade edge into the pool.
  (This no longer matches 3D -- see "What remains".)
- **D -- worldgen v11.** `develop` had already used v10 for the
  continents/ranges rework, and staging runs v10 seasons, so the headwater
  start pick is gated on `HEADWATER_RIVERS_MIN_WORLDGEN_VERSION = 11` with
  `CURRENT_WORLDGEN_VERSION = 11`. Standalone variant (start pick only, no
  new random draws, v9 fallback). On sample seeds 9-10 of 10 rivers start
  beside a mountain (5-7 before); v9 and v10 river paths are pinned by
  fingerprint tests.

## What remains

- **2D river mountain look.** 2D still draws a notch and a stream down the
  mountain tile; 3D now starts the river at the mountain's base. Change 2D to
  start the stream at the mountain's edge (renderer parity).
- **2D snow rule.** 2D peaks still use the old "tall or cold" snow
  (`variation.snow`); 3D uses "cold, or ~2/3 of summit tiles". Align them.
- **Not measured:** frame time with a range in view on a mid-range phone
  (A), and the worldgen-lab before/after for v11 -- town distribution, fair
  spawn sites, generation time (D). CI's worldgen and seed-state tests pass,
  but no side-by-side was run.
- **Local dev seasons are v1.** The seed-profile startup path in
  `simulation-service.ts` creates its fallback season without a
  `worldgenVersion`, so local seed worlds (`pnpm dev`,
  `rewrite:restart:20ai:seed`) are legacy v1 with no edge rivers, springs or
  river mountains. Testing this feature locally needed a temporary patch.
- **Rivers plan numbering.** `rivers-remake-plan.md` still calls its Phase 2
  river networks "worldgen v10"; v10 and v11 are taken, so it is now v12 at
  the earliest.
- **Retire this doc.** Per its own lifecycle, fold the durable facts above
  into `rivers-remake-plan.md` and delete this file.
- **Prod.** Gets the mountains and springs when develop is promoted to
  `main`; river mountains need a new season (v11) there.

## Decisions (owner, 2026-10-10; updated 2026-10-12)

1. **Version:** the headwater rule was to ship in v10 (PR D). Staging was
   already running v10 seasons, so it shipped as **v11** instead; the rivers
   plan Phase 2 network rework moves to v12.
2. **Snow rule:** both -- tall peaks and cold-biome peaks get snow; low peaks
   elsewhere stay bare.
3. **Prod v8:** left as is. Prod gets PR A now and river mountains with its
   next season.
4. **River mountains (2026-10-12):** no water on the rock -- the river flows
   out of the mountain's base, in a shallow banked channel.
5. **3D first (2026-10-12):** mountain look iterations target 3D; 2D follows
   (see "What remains").
