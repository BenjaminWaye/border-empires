# Rivers remake plan

Status: proposed, rev 2 (2026-10-07). Rev 1 proposed a shader distance-field
renderer; a self-review found it would drown rivers under ownership tint,
alias at zoom-out, blow phone texture limits on large worlds, and pull rivers
off tile borders. Rev 2 replaces it with a draped ribbon (below).

## Progress

| Step | State |
| --- | --- |
| Owner decisions 1-5 | Done (2026-10-07) |
| Phase 0 -- reproduce, versions, overlay heights, look target | Done (findings below) |
| Phase 1a -- water fix on existing meshes (v8 prod + v9 staging) | Implemented (PR #2262); verified locally on v9, needs review on staging/prod |
| Phase 1b -- draped ribbon rebuild (1.0-1.8) | After 1a is reviewed in game |
| Phase 2 -- worldgen v10 river networks + FARM bias | Next season |
| Phase 3 -- optional extras | Unscheduled |

Separate from this plan: the local seed-profile season `worldgenVersion`
stamping bug (Phase 0 findings) gets its own branch and regression test.

## Owner decisions (2026-10-07)

1. **Rivers flow along tile borders.** Every river step is one tile edge, and
   the *rendered* river must read as sitting on that border -- it must not
   visibly cut across tile squares.
2. **Lakes already exist** (`worldgen-lakes.ts`). No lake terrain changes.
3. **No direct gameplay effect.** Rivers guide players: towns and farm tiles
   are placed along them.
4. **Ownership overlay stops at the river.** Territory tint covers land up to
   the riverbank but never the water itself (Phase 1.4).
5. **Add a FARM bias toward rivers.** Today only towns use rivers (35% of the
   town target, `server-worldgen-towns.ts`); FARM clusters
   (`server-worldgen-clusters.ts`) ignore them. Phase 2.6 adds the bias.

## Diagnosis

### What is verified in code

- v9 rivers are three bolted-together pieces: the heightfield leaves out
  every tile touching a river corner (`client-map-3d-heightfield-river-mask.ts`),
  `client-map-3d-river-valley.ts` redraws them as 8x8 patches with a carved
  trench, and `client-map-3d-rivers.ts` adds a water mesh (ocean material,
  `renderOrder` 12).
- Ownership and fog-darken overlays draw flat per-tile quads at
  `heightfield.cornerYAt` (`client-map-3d.ts` ~L418, ~L974, ~L1256), i.e. the
  un-carved surface, with `depthWrite: false`
  (`client-map-3d-ownership-overlay.ts` L180) at `renderOrder` 6/7. So they
  bridge flat across the trench, and the water (drawn later) paints over them
  untinted and un-fogged.
- Path shape: `worldgen-rivers-edge.ts` walks a BFS distance-to-sea field
  with random 1-3 edge sideways steps -> long straight runs broken by
  single-edge jogs. ~10 single-trunk rivers per world.
- 2D draws rivers as axis-aligned rectangles inside each land tile's terrain
  draw (`client-map-render-river-edges.ts`, called from
  `client-map-render.ts` L272/L287).

### What was NOT verified before Phase 0 (all now closed -- see findings)

- The "square sections" symptom (hypothesis: valley patches and water cull
  by their own window/explored rules, separately from the heightfield).
- That the other tile overlays (prospect, frontier decay, barbarian tint,
  defensibility) also use flat `cornerYAt` quads -- only ownership and fog
  were checked.
- Which worldgen version the live staging/prod seasons run. Phase 1's "the
  current season gets the fix" assumes v9.

Phase 0 closed these before any code was written.

## Approach

**A flat, draped ribbon mesh, no trench.** The river is a strip of geometry
lying exactly on the heightfield surface (no carving, no cut-out tiles), drawn
at a deliberate point in the overlay stack. This fixes the in-game bugs at
their actual cause (carving + draw order + separate culling) with less code
and less risk than a shader field.

Why a ribbon beats a shader distance field (rev 1) here:

- Crisp vector edges at any zoom; no texture resolution limit (rivers are
  0.2-0.5 tiles wide -- under 2 texels at 4 texels/tile).
- No world-sized texture (the world is 640x320 by default and per-environment
  configurable up to 2048x2048, `world-size.ts`; 2048 x 4 texels exceeds the
  4096 max texture size on many phones).
- Flow direction for free: ribbon UV `u` runs along the river, `v` across, so
  flow animation is a UV scroll -- no angle encoding, no wrap seams.
- Zero cost on land pixels away from rivers.

Kept as a fallback only if the ribbon cannot meet the look target: the shader
field, done with analytic per-tile segment lists rather than a distance
texture.

## Phase 0 -- reproduce and pin down (before code) -- done

1. Find the live season worldgen version on staging and prod (staging admin
   endpoint; see `reference_staging_admin_via_gh_token`).
2. Run the local stack on a v9 seed (`docs/agents/topics/agent-gameplay-testing.md`)
   and capture screenshots of: a river inside owned territory, at a fog
   boundary, under a selection/hover marker, at a mouth, and zoomed out.
   These are the "before" set and the regression reference.
3. Grep every overlay that builds per-tile quads and record whether it uses
   `cornerYAt` (closes the unverified list above).
4. Agree a look target with the owner: 2-3 reference images (top-down
   strategy-game rivers at similar zoom). (How a river looks inside territory
   is decided: decision 4.)

## Phase 0 findings (2026-10-07)

- **Live versions.** Staging season-35 (started 2026-10-06, 320x160) is
  **v9**. Prod season-11 (started 2026-09-18, 640x320) is **v8**: `main` was
  at `CURRENT_WORLDGEN_VERSION = 8` when it started (v9 reached `main`
  2026-09-28). So prod players see the v1-v8 flat ribbon, not the carved v9
  valley. Phase 1 must cover v8 paths too (see 1.0).
- **Reproduced locally (v9, ai-5 territory, 320x160).**
  - At the explored edge, river water and riverbed patches hang past the
    explored land into the unexplored void as loose square chunks -- the
    "cut off with square sections / in the air" report. Cause: water points
    are kept if the tile *below/right of the corner* is explored, so an edge
    with one unexplored side still draws.
  - Water drawn over territory is washed out by the ownership fill under it.
  - Tight meanders self-overlap: the semi-transparent water overlaps itself
    and shows darker rings ("chain link" loops).
  - Valley patch tiles shade differently from neighbouring heightfield tiles
    (visible lighter/darker squares along rivers).
  - A pale pink-tinted trench near some sources.
  - 2D: thin blue lines on tile edges, hard right angles, covered by the
    ownership tint -- nearly invisible inside territory.
- **cornerYAt consumers.** ~25 client modules position things with
  `heightfield.cornerYAt` (capture overlays, claim plates, placement,
  selection range, prospect, roads, natural wonders, `tile-surface-y`, ...).
  Confirms: no trench, no corner-height changes.
- **Side finding (not river work).** A local seed-profile season is not
  stamped with `worldgenVersion`, so the client (and the sim on resume,
  `simulation-service.ts` ~L698) falls back to v1 terrain while the season
  was generated with the current version. Staging/prod seasons come from
  `start-next`, which stamps it. Local repro needs
  `SIMULATION_RULESET_ID=seasonal-default` + `start-next?force=true`.
- **Look target (owner, 2026-10-07):** Civ 6 / Civ 7 rivers -- dark,
  saturated blue-teal water that sits *low* in the land, framed by darker
  sloping banks; reads as recessed, never as a film on top. Owner's read of
  ours: "the water is floating above the river bed".
- **Why ours reads as floating (close-ups at 200 px/tile).** Geometrically
  the v9 water does sit in the bed (`waterYAt` = surface - 0.088, bed at
  surface - 0.16). It *looks* like a film because:
  1. it uses the ocean material: `transparent`, `opacity: 0.78`,
     `depthWrite: false`, with pale vertex colours (`WATER_EDGE`
     0.33/0.62/0.68) -- the ground and ownership tint show straight through;
  2. it is drawn last (`renderOrder` 12, after ownership 6/7), so it sits on
     top of everything as a pale overlay;
  3. no waterline cue -- no darker wet bank or shadow where water meets
     land, so nothing says "this is lower than the ground";
  4. trees and town structures stand in it: v9 water reaches ~0.27 tile from
     the border, i.e. into river-adjacent tile centres, where towns are
     placed by design and forest instances are drawn;
  5. tight meanders overlap the transparent water with itself (darker rings).
  None of these needs a carved trench to fix; all of them apply equally to a
  trench or a flat ribbon.

## Phase 1 -- new renderer for existing rivers (v8 prod, v9 staging)

No worldgen change. Consumes v9 edge paths and v1-v8 tile-centre paths.

### 1a Water fix first (shippable on its own)

Fixes the "floating" read on the existing meshes before the ribbon rebuild,
for v9 (staging) and v8 (prod):

- Dedicated river water material: opaque core, dark saturated blue-teal
  (target the reference images), `depthWrite: true`, soft alpha only in the
  outer edge band. No more ocean material.
- Draw order per decision 4: water above ownership fill, below fog-darken,
  borders and markers.
- Waterline cue: a darker wet band + soft inner shadow on the terrain just
  outside the water edge.
- Width: cap water + bank to ~0.3 tile from the border so it never reaches
  tile centres; no forest instances inside the bank band.
- Culling: draw an edge only when both tiles beside it are explored (fixes the
  pieces hanging into the unexplored void).
- v8: replace the `maxNearbyElevation` lift with exact surface draping.
- 2D parity (`client-map-render-river-edges.ts`): same colours, and draw
  river water after the tile's ownership tint so territory no longer hides
  it (decision 4); same both-explored rule. Rounded corners wait for 1.7.

1a acceptance:

- Regression tests: both-explored culling predicate on a synthetic explored
  mask; render-order constants `ownership < riverWater < fogDarken <
  markers`; river material is opaque with `depthWrite: true` (not the ocean
  material); v8 strip y equals the heightfield surface for synthetic
  `cornerYAt`.
- Re-capture the Phase 0 "before" set (fog edge, close-up in territory, 2D)
  on v9 and a v8 seed: no void-hanging chunks, no washed-out film, no dark
  overlap rings, no trees/towns standing in water.
- Changelog entry.

1a implementation (file by file):

1. `client-map-3d-render-order.ts` (new): named render-order constants for
   ownership (6/7), river water (8) and fog-darken (9/10), plus markers.
   `createOwnershipOverlay` takes an optional render-order override; the two
   fog overlays (both multiply blends, so their order relative to each other
   doesn't matter) move to 9/10, above the water.
2. `client-map-3d-river-water-material.ts` (new): dedicated
   `MeshStandardMaterial`, RGBA vertex colours (opaque core, soft alpha only
   at the outer edge), `depthWrite: true`. `appendWater` emits five
   vertices across the channel instead of three so the core stays opaque.
   The ocean material is no longer passed in.
3. `client-map-3d-rivers-channel.ts`: cap the rendered half-width
   (`MAX_CHANNEL_HALF_WIDTH`) and narrow `BANK_WIDTH` so trench + bank stays
   within 0.30 tile of the border; dark wet band in the valley colours just
   above the waterline (`client-map-3d-river-valley.ts`).
4. Culling: `client-map-3d-heightfield-window.ts` (new) is the single
   source for the heightfield's tile window; the heightfield, the valley
   patches and the water all use it (the valley used to reach 3 tiles past
   it). A water sample is kept only when the tiles on *both* sides of the
   centreline are explored and inside that window.
5. v8 ribbon: same river material and render order; vertices draped on
   `heightfieldSurfaceY` (+ small lift) instead of the `maxNearbyElevation`
   upper bound, keeping that bound only on hills tiles (separate dome mesh).
6. Trees: forest and tropical-forest layouts skip any tree within the bank
   reach of a river edge of its tile (v9 only; v8 has no edge rivers).
7. 2D: new water/bank colours; after the live ownership tint, the tile's
   river water is drawn again so territory no longer hides it (helper
   extracted from `client-runtime-loop.ts` so that file shrinks). 2D
   already draws only the explored tile's own half of the channel, so it
   has no void-hanging pieces to cull.
8. Changelog entry; tests beside each module.

1a follow-ups after in-game review (2026-10-07):

- **Fog edge: half a river per tile.** A border river is half on each of
  its two tiles; each half of the water draws when its own tile is
  explored (`riverSampleSides`). The all-or-nothing rule left the explored
  tile's carved half-bed dry. Rivers stay on tile borders (decision 1).
- **Mouth.** The channel cuts down to sea level over its last ~1.2 tiles
  (`withMouthDescent` / `riverDescentScale`), then a plume curves from the
  river's heading into the sea tile(s) at the final corner, widening and
  fading (`riverMouthPlume`; straight out to sea when carrying on would run
  over land). The plume draws after the ocean (`RENDER_ORDER.riverMouth`)
  without writing depth, only over sea tiles, and is never carved into the
  coast. Valley patches drop a full coast skirt on edges facing sea or
  unexplored tiles (the heightfield skips its own skirt for them), which
  removed a black crack along river coasts.
- **Mouth cove and calm sea.** The coast is a square step with square
  sea-tile edges, and the sea's tile corners bob ~0.22 with the waves, so
  those edges showed exactly where the river met the sea. Within
  `COVE_RADIUS` of each mouth corner the riverside land is cut down just
  under the sea (`riverCoveY`) and a round estuary pool of river water
  covers it (`appendEstuary`); its rim hides wherever the land rises, giving
  a curved shoreline. The ocean's waves fade to flat around each mouth
  (`client-map-3d-river-mouths.ts` -> `createWaterSurface(..., waveCalmAt)`).
- **Territory colour vs bank (option A).** Decision 4 taken literally let
  the flat ownership sheet paint the carved bank owner-coloured up to the
  water, so the river read as a strip stuck on top. A wet-earth bank strip
  now lies on the carved bank between the ownership fill and the water
  (`RENDER_ORDER.riverBank`, `client-map-3d-river-bank-strip.ts`): territory
  colour shows up to the top of the bank. 2D redraws the bank band with the
  water after the tint. Option B (tint draped into the trench, fading
  toward the water) is left for 1b.

1b (the rest of Phase 1) then replaces the valley patches with the draped
ribbon. Banks get their slope from per-vertex normals tilted away from the
water (lit like a bank, no geometry moved), so the recessed look survives
without carving.

### 1.0 v8 (prod) coverage

Prod is on v8 (Phase 0). v1-v8 paths go through the same draped-ribbon
pipeline -- same surface draping, culling, draw order and water look -- but
keep their tile-centre course (they never claimed to follow borders). Only
1.1's border rule is v9-specific. This retires the floating v1-v8 ribbon
(`maxNearbyElevation` lift) on prod without waiting for a new season.

### 1.1 Centreline (stays on the border)

- The centreline runs **exactly on the tile edge** for every straight edge.
- Corners are rounded with a fixed small radius (target 0.12-0.18 tile, so
  at most ~0.05 tile intrudes into the inside tile); no edge-midpoint spline,
  no diagonal straightening, no wobble beyond ~0.02 tile.
- Unit test: every centreline sample lies within `CORNER_RADIUS` of its
  source edge, and straight-edge samples lie on it exactly.

### 1.2 Ribbon geometry

- Two strips per river: a wider wet-bank strip (dark mud/damp grass, alpha
  falloff at its outer edge) and a narrower water strip on top.
- Vertices sit on the exact heightfield surface (`heightfieldSurfaceY`,
  honouring the heightfield's b-c diagonal split), resampled wherever the
  ribbon crosses a terrain triangle edge, so it never cuts through the ground.
  Small lift + polygon offset, as other surface overlays do.
- Half-width cap so water + bank stays within ~0.3 tile of the border --
  clear of the tile-centre footprint where towns/farms/structures sit.
- Minimum on-screen width: ribbon stores centre + side vector; the vertex
  shader widens it to at least ~1.5 px at the current camera distance, so
  rivers neither shimmer nor vanish when zoomed out.

### 1.3 Culling: one rule, shared with the heightfield

- Built from the exact same window inputs as the heightfield
  (`sharedTerrainWindow` in `rebuildVisibleTerrain`).
- A river edge is emitted iff **both** tiles it separates are explored and
  inside the window -- the same predicate the heightfield uses per tile. No
  separate reach/margin rules (the current `reachW`/`marginW` split goes).
- Unit test: synthetic explored mask -> emitted edges match exactly.

### 1.4 Draw order (decision 4: ownership stops at the river)

The ribbon's two strips sit on either side of the ownership overlay:

- **Bank strip** at `renderOrder` 5 -- below ownership fill (6/7), so the
  territory tint covers the bank like any other ground, right up to the
  water's edge.
- **Water strip** at `renderOrder` 8 -- above ownership fill, so the water is
  never tinted, but **below** fog-darken (which moves to its own higher
  `renderOrder`), selection, hover, borders and markers. Fog still darkens the
  river like the ground, and nothing "floats" over overlays because the ribbon
  lies on the surface.

The water is opaque at its core with a soft alpha edge, so the territory tint
fades out at the waterline rather than ending in a hard line. No per-owner
data in the ribbon, so it does not rebuild on ownership changes.

Settled ownership opacity stays 0.85 (owner rule); this design does not touch
it.

Regression test: render-order constants satisfy
`riverBank < ownership < riverWater < fogDarken < markers`.

### 1.5 Water look

- River material (not the ocean's): colour ramp matched to the ocean's
  shallow palette, flow scroll along `u` driven by the existing frame time
  (never sampled inside `rebuildVisibleTerrain`, which also runs on camera
  pan), edge foam from `v`, sun glint. Width-scaled flow speed.
- Mouth: the ribbon continues down the coastal skirt as a short sloped strip
  to `WATER_SURFACE_Y` and fans out on the sea surface, fading into the ocean
  colour. **No corner-height lowering** (would tilt town/dock tiles and push
  coastal land under the sea plane).
- No macro valley in Phase 1 (same reason). Revisit only with a check of
  everything that reads `cornerYAt`.

### 1.6 Deletions

`client-map-3d-river-valley.ts`, `client-map-3d-heightfield-river-mask.ts`
(river tiles return to the heightfield), the trench/water parts of
`client-map-3d-rivers-channel.ts`, the ocean-material water mesh.

### 1.7 2D renderer (parity)

Keep the per-tile structure (rivers are drawn inside each tile's terrain
draw): precompute, per seed, each land tile's local river pieces (the parts
of the rounded centreline within that tile's square) and draw them as short
Path2D strokes -- bank then water, round caps -- clipped to the tile rect.
No full-screen pass, no explored clip path (unexplored tiles aren't drawn).
Cache is per seed, bounded to one seed.

### 1.8 Acceptance

- Phase 0 screenshot set re-captured: none of the original symptoms.
- `rebuildVisibleTerrain` river cost <= 3 ms at max zoom-out on a desktop
  build (valley rebuild today: ~10 ms); frame time unchanged on a mid-range
  phone with a river in view.
- Regression tests from 1.1, 1.3, 1.4 plus: ribbon vertex y matches
  heightfield surface for synthetic `cornerYAt`.
- Changelog entry.

## Phase 2 -- better river networks (worldgen v10, next season)

Still on the corner lattice; every step one tile edge. v1-v9 seasons keep
their exact paths (dispatch in `worldgen-rivers.ts`, as today).

### 2.1 Integer-only, engine-independent generation

`seeded01` uses `Math.sin` (`worldgen-noise.ts`), and rivers are computed on
both client (rendering) and server (town placement); `Math.sin` is not
guaranteed bit-identical across JS engines. v10 river code uses an integer
hash (`Math.imul`-based) and integer elevations only. Determinism test:
fixed seeds -> stored path hash, run in Node; plus a v9 snapshot test proving
v9 output is unchanged.

### 2.2 Elevation and drainage

- Integer elevation per corner: BFS distance-to-sink + hill/mountain
  proximity term + low-frequency integer noise. The noise term is what
  produces broad meanders: rivers follow its valleys.
- Sinks: corners touching sea, coastal sea or lake.
- Priority-Flood from the sinks over walkable edges only (both tiles plain
  LAND, corner clear of hills/mountains). Corners the flood never reaches
  (land boxed in by hills/mountains) are **not river-eligible** -- no river
  starts there; this is accepted, not "fixed" with new lakes.
- Every eligible corner then has a strictly-descending walkable neighbour
  chain to a sink, which keeps the termination guarantee the v9 walker has.

### 2.3 Network

- Flow accumulation down that chain; corners above a threshold are river.
  Tributaries merge at confluence corners; half-width grows ~sqrt(flow),
  clamped to the Phase 1.2 width cap.
- Lakes are sinks only. Lake outlets (rivers leaving a lake) are out of
  scope for v10 -- listed in Phase 3.

### 2.4 Shape rules (post-process, after a guaranteed-terminating path)

- Local rewrite pass removes isolated one-edge jogs (`E,S,E` -> `E,E,S` /
  `S,E,E`) when the replacement edges are walkable and don't touch another
  river; the descending property is not required for the rewritten edges,
  since termination is already proven on the raw path.
- Where a jog cannot be removed it stays (rare; counted -- see 2.7).
- Spacing: two different rivers may not run along both edges of a one-tile
  strip; they may share a corner only at a confluence.

### 2.5 Density

Scaled to land area (world size is configurable): target ~1 river system per
N land tiles, tuned in `apps/worldgen-lab` to roughly 30-60 systems on the
default 640x320 world.

### 2.6 Guidance placement (decision 5)

Towns keep their 35% river share over the bigger network. Add a FARM bias in
`server-worldgen-clusters.ts`: a share of FARM cluster centres (start ~35%, to
mirror towns; tuned in 2.7) is drawn from shuffled river-adjacent tiles first,
same pattern as `riverAdjacentTilesFor` for towns, before the existing
placement fills the rest. Gated on worldgen v10 so running seasons keep their
exact resources. Total FARM count unchanged -- only where they land moves.
Knock-on: FARM is first in `clusterPlan` and every later cluster (UMBRITE,
GEMS, TITANIUM, FISH) is spaced against the `centers` placed before it, so
moving FARM centres moves all resource clusters in v10 seeds. 2.7 compares
the full resource distribution, not just FARM.

### 2.7 Validation

This changes where towns and resources land, so it is not "no gameplay
effect" in practice:

- worldgen-lab stats per seed: river systems, total river edges, share of
  land within 3 tiles of a river, unremovable-jog count, ineligible-corner
  share.
- Before/after distributions for towns and FARM clusters; fair spawn sites
  (`server-worldgen-fair-spawn-sites.ts`) still pass; AI planner smoke run.
- Generation time on the default world: <= 150 ms in Node and in the client
  (it runs on season seeding and on every client load).

## Phase 3 -- optional

Lake outlets, bridges where roads cross rivers (road network exists),
rapids where a river leaves high ground, reeds/rocks along banks, relaxing
the no-hills rule now that the patch mesh is gone.

## Risks and trade-offs

- A ribbon has no real channel depth; banks are shading. Accepted: a
  0.3-tile trench is invisible at gameplay zoom, and carving is what broke
  overlays.
- River water drawn above ownership fill (decision 4) means territory tint
  visibly stops at the waterline; reverting is one render-order constant.
- Map knowledge: the client already derives the whole world, rivers included,
  from the seed. Phase 2 adds no new client data, but a farm bias makes
  river knowledge slightly more valuable to someone computing unexplored
  terrain offline. Pre-existing exposure; not addressed here.
