# Relics — Natural Wonders Remade as Concordance Anchors

Status: historical proposal — superseded by the accepted ziggurat and gameplay redesign
Owner: Benjamin Waye (design sign-off on canon, variant mapping and terrain rules)
Last verified: 2026-10-22
Replaces: the fiction and 3D/2D look in [`natural-wonders-design.md`](natural-wonders-design.md) §2 (effects and spawn rules stay canonical there until this ships)

Current direction: [execution plan](relics-execution-plan.md) and [visual/design decisions](relic-overlay-preview.md). The blade silhouettes, unchanged-effects assumption and mandatory shatter terrain below are historical proposals, not implementation requirements.

## Problem

The nine natural wonders work mechanically but read wrong and explore flat:

- **They contradict the setting.** Their flavor is fresh machinery — brass
  telescopes, pneumatic pistons, copper pump-houses
  (`packages/shared/src/natural-wonder-labels.ts`). The world bible says
  frontier worlds run on plain combustion machinery and that aether constructs
  are Concordance leftovers ([galactic-lore §1, §4](lore/galactic-lore.md)).
  Nothing explains who built a working Warpress on an unclaimed world.
- **Nine bespoke looks, no shared language.** Each wonder has its own ~300-line
  3D overlay (`packages/client/src/client-map-3d-natural-wonders/`) and its own
  2D image. A player can't tell from a distance that two of them belong to the
  same category of thing, or roughly what one does.
- **Nothing to discover.** A wonder is fully identified the moment it is seen,
  and the ground around it is ordinary terrain, so taking one is the same as
  taking any other tile.

## Proposed change

### 1. Fiction: relics are Terrain-Shaping anchors (proposed canon)

Shards are already the drifting pieces of the Sovereign Siege Engine
(galactic-lore §3), so relics must be something else.

> **Relics** are the anchors the Concordance drove into each world it held.
> §1 lists Terrain Shaping among the things the Engine powered; the relics are
> the machinery that work ran through — gigantic monolithic blades, sharp-edged
> and dark, rising straight out of the ground. When the Engine shattered they
> lost their driver but not their structure. Each still performs one fragment
> of its old function, and a Duke whose border reaches one can draw on it.
> The Court's Relay Beacon (§10) is a small, cheap imitation of the same
> anchor technology; a relic is the original, at the Concordance's scale.

Consequences that stay consistent with existing canon:

- Relics are **dormant, fixed and permanent**; Shards are unstable and brief.
  The contrast is deliberate.
- A relic still **bends the land around it** (§4 below). This is the in-world
  reason relic terrain differs from ordinary frontier.
- Claiming a relic is aether-work in the §5 sense. This proposal does not add
  any Warden or infestation reaction to it — that is deferred (see Out of
  scope).

The player-facing name changes from "natural wonder" to **relic**. Internal
identifiers (`NaturalWonderType`, `tile.naturalWonder`, persisted state) keep
their names to avoid a save/wire migration; only display copy changes.

### 2. Three relic variants

One standard relic look — monolithic blades with hard, faceted edges, matte
dark stone with aether light in the seams — in three silhouettes. The
silhouette tells a player the effect family before they know the exact effect.

| Variant | Silhouette | Family | Relics |
|---|---|---|---|
| **Spire** | One tall needle blade, slightly leaning, with a thin seam of light up its full height | Sight | Watchtower Engine, Cartographer's Lens |
| **Crown** | A ring of 5–7 blades leaning inward over a glowing core | Economy | Foundry Heart, Calculating Engine, Quickforge, Deepwater Engine |
| **Fang** | A burst of jagged blades thrust outward at angles, like a broken wall | War | Conscription Engine, Warpress, Bastion Frame |

Individual relics within a variant are distinguished by seam/core colour (reuse
the palette in `apps/worldgen-lab/src/renderer.ts`) and a single glyph on the
tile overview. Each relic keeps its current proper name for now (e.g. "the
Warpress relic"); renaming them to fit the anchor fiction is an open question.

### 3. Effects are unchanged

All twelve current bonuses carry over untouched. Source of truth:
`apps/simulation/src/runtime-natural-wonders.ts`, plus the call sites listed.

| # | Relic | Variant | Effect |
|---|---|---|---|
| 1 | Foundry Heart | Crown | +1 resource slot each of FOOD, TITANIUM, CRYSTAL, UMBRITE |
| 2 | Deepwater Engine | Crown | Dock coin income ×2 |
| 3 | Deepwater Engine | Crown | Attacks launched from a dock +15% ATK |
| 4 | Conscription Engine | Fang | +2,000 manpower cap (`apps/simulation/src/runtime/runtime-manpower-economy.ts`) |
| 5 | Conscription Engine | Fang | +2,000 manpower once per season, to whoever claims the tile first |
| 6 | Warpress | Fang | Mustering flags fill 2× faster |
| 7 | Warpress | Fang | +1 max muster flag (6 instead of 5) |
| 8 | Bastion Frame | Fang | +0.5× additive defense multiplier on every owned fort |
| 9 | Calculating Engine | Crown | Tech research coin cost −10% |
| 10 | Quickforge | Crown | One rush-buy per UTC day is 40 coin cheaper (`packages/shared/src/rush-buy/rush-buy.ts`) |
| 11 | Watchtower Engine | Spire | The relic tile works as an Observatory with no CRYSTAL upkeep and a fixed cast radius of `OBSERVATORY_CAST_RADIUS + 10` (`WATCHTOWER_ENGINE_OBSERVATORY_RANGE` in `runtime-ability-helpers.ts`; it replaces the player's range rather than adding to it) |
| 12 | Cartographer's Lens | Spire | +1 vision range on every owned tile |

Spawn predicates (`packages/game-domain/src/server-worldgen-natural-wonders.ts`)
and the one-of-each-per-map rule are also unchanged.

### 4. Shatter zone: terrain around a relic

A relic reshapes the ground within Manhattan radius 3 of itself at worldgen
time. The goal is that every relic is a small, readable fortress: you can see
it coming, there are a limited number of ways in, and holding it means holding
the approach.

1. **Blade ridges.** 2–4 short ridges of `MOUNTAIN` tiles (2–3 tiles each)
   radiate outward from the ring at distance 2, oriented by the seed. Mountains
   are already a barrier and already mutable by Create/Remove Mountain, so no
   new terrain rule is needed.
2. **Guaranteed passes.** At least two non-adjacent `LAND` corridors must
   connect the relic tile to land outside radius 3. Ridge placement is rejected
   and retried if it would leave fewer, or would cut off any town, dock,
   resource cluster or neighbouring land region.
3. **The relic tile and its 8 neighbours stay `LAND`** and free of forest, so
   the relic is always claimable and visible as a clearing.
4. **Variant flavour (visual only in the first slice).** Crown zones get
   crystal-veined ground, Fang zones get cracked dark rock, Spire zones get
   bare scoured stone. These change the ground material, not the rules.

Placement constraints carried over from today: a relic a player spawn lands on
is still deleted by spawn placement, and AFC landing still flattens mountains
in its 3×3 footprint.

**Where ridges are generated is unresolved** (see Review findings below).
Wonders are placed last, in `apps/simulation/src/season-seed-world.ts`
(`generateNaturalWonders`, after clusters, docks, towns, ring interiors and the
fair-spawn check), from inputs that read `terrainAt`. So ridges cannot simply
move into shared seed-derived worldgen without a circular dependency. The
simulation already mutates terrain after worldgen and sends it to clients as
the tile `terrain` field (Create/Remove Mountain, AFC landing), so a
simulation-side placement is possible, but it would have to re-run the
reachability checks the acceptance loop guarantees today.

### 5. Exploration: identity is earned

- **Seen from afar as a variant only.** A relic casts a faint vertical light
  column in its seam colour. The column is visible through fog at long range
  (proposal: 12 tiles beyond the player's vision), so players know there is a
  Spire, Crown or Fang in that direction — but not which relic it is.
- **Identified when in vision.** While the relic tile itself is fogged, the
  client shows only the variant silhouette and the tile overview reads
  "Unidentified relic (Crown)". Once the tile is in the player's vision, its
  name and effect are revealed. The simulation must stop sending
  `naturalWonder.type` for relics the player has not yet identified and send
  the variant instead; the "identified" flag is per player and persists for
  the season.
- **First identification is an event.** Identifying a relic adds an Activity
  Feed entry with its lore line, so scouting produces something to read.

### 6. Rendering (both renderers)

Per the renderer-parity rule in AGENTS.md, every item ships in the 2D canvas
path and the true-3D path together:

| Item | 3D | 2D |
|---|---|---|
| Three variant meshes replacing the nine bespoke overlays | `client-map-3d-natural-wonders/` (one module per variant; colour/glyph per relic) | Three variant images in the overlay-images pass (`client-map-2d-natural-wonder-overlay.ts`) |
| Fogged-relic silhouette and light column | Column billboard rendered above fog | Column marker drawn at the fog edge on the relic's tile |
| Shatter-zone ground material | Ground contour already spans 3×3 (`client-map-3d-wonder-ground-contour.ts`); extend to radius 3 | Tinted ground pass for the zone |
| Blade ridges | Existing mountain rendering (they are ordinary `MOUNTAIN` tiles) | Existing mountain rendering |

Storybook gets one story per variant in the natural wonders gallery,
`packages/storybook/src/map/natural-wonders/NaturalWonders.stories.ts`.

## Out of scope

- **Wardens or other guardians at relics.** Deferred; to be designed later on
  top of this.
- **Changing any bonus value or spawn predicate.**
- **Renaming internal identifiers or the persisted wonder state.**
- Shard-fall affinity near relics and an Archive/codex of relic lore were
  discussed as later hooks; not part of this proposal.

## Open questions

1. Should the nine relics get new proper names that fit the anchor fiction
   (the current names describe machines), or keep their names?
2. Exact light-column reveal range, and whether it should also show on the
   minimap.
3. Should ridge tiles be removable by Remove Mountain like any other mountain,
   or protected for the season?
4. Is three ridges/two passes the right density on small maps, where relic
   placement already fails occasionally?

### Review findings to resolve before implementation

Raised in review of this proposal; each needs a decision before its slice
starts.

- **Ridge generation order (§4).** See the note in §4: ridges added before
  wonder placement change predicate results (Bastion Frame and Cartographer's
  Lens need nearby MOUNTAIN); ridges added after acceptance bypass the
  fair-spawn and dock-reachability checks.
- **Information leaks (§5).** Anything seed-derived (ridges, variant ground) is
  computable by any client, which already receives `worldSeed`, so it would
  reveal every relic's position and variant. Variant plus biome also gives the
  type away for most relics (Foundry Heart only spawns in CRYSTAL_WASTES,
  Conscription Engine in BROKEN_HIGHLANDS, Watchtower Engine in DEEP_FOREST).
  The "cannot learn its type" acceptance criterion needs a design that
  survives this, or should be dropped.
- **What §5 actually changes.** A wonder is identified on first sight today,
  and the client gets no wonder data for tiles never in vision, so "identified
  when in vision" mostly adds the long-range column. The column needs its own
  message (out-of-vision tiles get no deltas). Define whether ally vision,
  Reveal Empire, observatory casts and reach vision count as "in vision"; list
  the client consumers that assume `naturalWonder.type` is present; decide
  whether the AI planner (`apps/simulation/src/ai/frontier-scoring.ts`, which
  scores `naturalWonder` with no fog gate) must also identify relics. The
  existing "Natural Wonder Discovered" tip
  (`packages/client/src/client-discovery-tips/client-discovery-tips.ts`)
  already fires on first sight; reuse it rather than adding a second entry.
- **Relics are not permanent today.** `CREATE_MOUNTAIN` on a wonder tile clears
  it (`runtime-terrain-shaping-command-handlers.ts`), except the Watchtower
  Engine, whose tile carries an observatory. Create Mountain on the passes or
  the 8 neighbours can also seal a relic after worldgen. Decide whether relic
  tiles and passes are protected.
- **Zone geometry (§4).** A Manhattan radius-3 diamond, ridges "at distance 2"
  that are 2–3 tiles long, and a "ring" around the relic are not consistent
  with each other or with rule 3 (the (±1,±1) diagonals are in the Manhattan-2
  ring). Rule 3 also conflicts with current predicates (Deepwater Engine may
  have sea within 2, the Watchtower Engine spawns in deep forest), so it would
  change spawn outcomes. A spawn landing on a relic deletes it but would leave
  its ridges behind.
- **Canon.** The world bible already names Monuments as the surviving
  Concordance aether constructs (§1), credits the Court with anchor technology
  (§2, §10), and says the Wardens came to destroy Concordance aether
  infrastructure (§4). The relic fiction must reconcile with all three, and
  with §5's rule that aether-work draws Wardens. "Relic" is also already used
  for a Warden ship in the galactic campaign
  (`docs/galactic-campaign-design.md`, `galaxy-duke-config.ts`).

## Delivery slices

1. **Look and fiction.** Three variant meshes and 2D images; display copy
   changes from "natural wonder" to "relic"; world bible updated from proposed
   to accepted canon; changelog entry.
2. **Shatter zone.** Worldgen ridge/pass generation behind a version bump,
   ground materials in both renderers, regression tests for the guaranteed
   passes and for cluster/town/dock reachability.
3. **Exploration.** Per-player identification, variant-only wire payload for
   unidentified relics, light column through fog, Activity Feed entry.

## Acceptance criteria

- Every relic renders as one of three variant silhouettes in both renderers,
  and no bespoke per-wonder mesh remains.
- All twelve effects behave exactly as before (existing wonder tests pass
  unchanged).
- Every generated relic has at least two land corridors out of its shatter zone
  and no town, dock or cluster is cut off by ridge placement.
- A player who has never had a relic in vision cannot learn its type from
  anything the client receives.

## Verification

Worldgen tests beside `server-worldgen-natural-wonders.ts` for ridge and pass
guarantees across many seeds; simulation tests for per-player identification
and the wire payload; Storybook sign-off per variant; a local gameplay check in
both renderers. When delivered, fold the result into
[`natural-wonders-design.md`](natural-wonders-design.md) (or replace it with a
relic reference), update [`game-mechanics.md`](game-mechanics.md), and move the
relic fiction in [the world bible](lore/galactic-lore.md) from proposed to
accepted.
