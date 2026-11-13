# Territory development plan

Status: proposed (2026-11-12). Design agreed with the owner in discussion;
numbers marked "starting value" are for a balance pass. Each phase below
states what is implemented. The refinery and booster models
(`packages/client/src/client-town-district/support-model-refinery.ts`) are
reviewed in Storybook under Map / Structures / Refineries.

## Goal

Make improving your territory the main activity of a visit, with fighting
running in the background (`docs/core-loop.md` §1.1). Today the frontier
materials add a large but invisible regen bonus (+120 manpower per 4h refill
for a first site of each type, more than the capital's 96) that asks for no
decision, and every deposit carries its own building. This plan:

1. Cuts neural resin, conductive minerals and catalyst.
2. Moves strategic processing into towns: a **refinery** on a support-ring
   tile processes one nearby deposit field, linked through your territory.

Each phase ships and is played on its own before the next starts. Town roles
and FOOD-as-growth were considered and dropped: roles only restricted
buildings that are already one per town, and the FOOD rework added chores
without a clear payoff. FOOD can get its own discussion later.

## Design inputs

Owner intent is recorded in `docs/core-loop.md` §1.1. The ones that shape this
plan:

- About four turns a day (4h manpower refill), 15–30 minute visits.
- 5–10 towns per typical empire, 40–50 for a leader: per-town decisions must
  stay manageable at 50.
- Players build away every surplus strategic slot, so more slots is a strong
  reward.
- Developed land is captured, never raided. "Disabled after capture" means the
  existing capture hold (`CAPTURE_HOLD_MS`, 60 s) plus garrison time, and the
  10-minute town capture shock for towns; there is no separate structure
  timer.
- New building types are cheap; AI support is wanted but not required at
  launch. No live players, so no migration of saved campaigns is needed.

Every feature must pass four questions: is it a real decision, can you see
it on the map, can someone take it from you, does it fit a visit?

## Phase 1: Cut the three frontier materials

Status: implemented (2026-11-12). Saved deposits and installations are
dropped on recovery by
`apps/simulation/src/resource-networks/retired-frontier-materials.ts`.

**Rules.** Resin, conductive minerals and catalyst disappear: no deposits, no
Resin Extractor / Implant Foundry / Catalyst Refinery, no manpower regen from
them, no trades in them. Luxury biota and precursor salvage are unchanged.

**Code.**

- Shared: `packages/shared/src/resource-networks/` (`resource-networks.ts`
  `ANCILLARY_MATERIAL_RESOURCES` and the network resource list,
  `frontier-resource-effects.ts` material regen, `resource-network-biomes.ts`,
  installation costs), `structure-registry-economic.ts`,
  `structure-costs/`, `structure-slots/`, `structure-display-names/`,
  `messages/` enums, `resource-supply-trades/` (8 negotiable resources become
  5).
- Manifests and tech tree (`packages/game-domain/data/tech-tree.json`):
  remove the `neural-resin-processing` warrant; drop the Implant Foundry from
  `organized-supply` (it keeps the Ancillary Depot); keep
  `frontier-concessions` (it also unlocks the Cultivation Estate) but remove
  catalysts from its description.
- Simulation: `resource-networks-worldgen.ts` (stop seeding the three),
  `apps/simulation/src/resource-networks/`, the material term in manpower
  regen, siphon targets, AI extractor scoring and trade asks.
- Client: `client-resource-networks/`, resource icons, structure art, map
  render, tile menu, tech detail, structure info catalog; Storybook stories.
- Snapshots: confirm a snapshot holding a removed structure or deposit type
  still loads (drop the record) rather than failing.

**Docs and lore.** Economy reference "Frontier resource networks" and
"Diplomatic resource supply", `docs/game-mechanics.md` (developed resource
networks, resource trades), and `docs/lore/galactic-lore.md` "Frontier
concessions and ancillary supply" (rewrite the "three frontier inputs"
passage so remaking runs on town industry).

**Done when.** No references remain outside `docs/archive/`. The loss is
large for a developed empire (at least +360 manpower per refill with one site
of each type, against 96 from the capital), so measure it: compare manpower
regen per refill and time to City tier in an AI test season before and after.
If the drop is material, put the regen back through towns or Ancillary
buildings (scoped in the same branch), not the map.

## Phase 2: Refineries in towns

Status: server and shared rules implemented (2026-11-12); client UI (supply
lines, moving goods, refined overlay, field and town pickers, toast)
implemented (2026-11-12, `packages/client/src/client-refineries/`); worldgen
relocation and the AI planner are tracked separately. Implemented numbers:
`REFINERY_REACH_LAND_TILES` = 10, `REFINERY_SLOTS_PER_TILE` = 2,
`REFINERY_BOOSTER_SLOTS_PER_TILE` = 1 (+3 per tile with the booster). Titanium
and Crystal Refinery need `mining`, Umbrite Refinery `leatherworking`, the
three boosters `industrial-extraction`. Refineries: 80 manpower, 1 FOOD slot,
`same_tile` (stack per town); boosters: 150 manpower, 1 FOOD slot,
`town_support` (one per town). Rules live in `packages/shared/src/refineries/`
(fields, link BFS, exclusivity, field choice), the simulation glue in
`apps/simulation/src/refineries/` (slot supply, `BUILD_ECONOMIC_STRUCTURE`
`fieldX`/`fieldY`, `ASSIGN_REFINERY_FIELD`, wire status). Decisions taken
while implementing: exclusivity is per owner (two players' refineries on one
component each refine only their own tiles); re-anchoring is derived at
evaluation time, not written back; a refinery's tile must be SETTLED to work;
a FOOD-dormant refinery still processes its field (same known gap as every
slot boost). Recovery drops saved Mine / Umbrite Rig / Ore Refinery records
(`retired-frontier-materials.ts`). The wire status is attached where the
`supportAnchor` projection runs, so it is refreshed when the refinery tile
itself is sent; a change elsewhere on the link path does not re-send it (the
client follow-up should refresh or recompute it).

### Rules (starting values)

1. **Bare deposits.** A garrisoned Titanium, Umbrite or Gems tile gives its 1
   slot. Mine, Umbrite Rig and Ore Refinery are removed; nothing is built on
   deposit tiles.
2. **A refinery costs a ring tile.** Titanium Refinery, Umbrite Refinery and
   Crystal Refinery are built on a tile of a town's support ring. That tile
   can no longer hold any other support building: it is the sacrifice.
3. **One refinery processes one deposit field.** A field is a connected group
   of same-resource deposit tiles (worldgen places 1–8 tiles: single hilltop
   Umbrite and Gems tiles, 2 for grassland Titanium, 5 for Gems, 6–8 for other
   Titanium and forest Umbrite). Each processed, garrisoned field tile gives +2 slots (starting
   value). Another field needs another refinery, in the same town or
   another. Each field feeds at most one refinery.
4. **Reach: 10 land tiles from the town tile**, for every town tier, measured
   over land with 8-way steps. (This is 8 tiles past a Great City's second
   support ring; one number for all tiers keeps it simple.) A field is in
   reach when any of its tiles is.
5. **Link.** The field must be joined to the town by the owner's own land
   (FRONTIER or SETTLED; garrisoning is not required). Water and other
   players' land break it.
6. **Choosing the field.** Building a refinery asks which reachable field it
   takes; the player can reassign it later. A field between two towns is a
   choice.
7. **Broken link or lost field.** The refinery keeps its tile but stops
   processing; a toast above it asks for a new field, and the deposit loses
   its refined overlay. Restoring the link resumes processing.
8. **Capture.** A refinery or booster works only while the same player holds
   both its tile and its town. Taking the town stops its refineries; taking
   just the refinery tile stops that refinery for both players until one
   holds both again. Captured sites follow the existing capture hold.
9. **Worldgen guarantee.** Every strategic field placed by worldgen has at
   least one town within reach, and no field tile sits on a town tile or
   inside either support ring; the check covers every cluster, not only moved
   ones. Deposits created at runtime (waystation resource rewards) carry no
   guarantee: out of reach, they give their base slot only. **Implemented**
   (worldgen v13; see the Worldgen bullet below).
10. **Refinery boosters.** One support building per resource (working names:
    Titanium Smelter, Umbrite Distillery, Crystal Cutter) is built on another
    support-ring tile of the same town. While it stands, each refinery of that
    resource in the town gives +1 more slot per processed tile (so +3 instead
    of +2). One booster per resource per town. It costs a second ring tile, so
    a town that commits to a resource gives up more of its ring.

Open: whether a Town (not just City and above) can host a refinery; whether
output should also fall with distance inside the reach; whether the booster's
+1 is per processed tile (as written) or one extra slot per refinery.

### Simulation and shared code

- **Structure types.** Add the three refineries and the three boosters through the full
  `docs/adding-a-structure-playbook.md` (type union, cost, slots, registry
  and tech gate, placement metadata: town and support surfaces only, wire
  enum). Remove `MINE`, `UMBRITE_RIG` and `ORE_REFINERY` the same way,
  including `afc-specializations/afc-installation-grants.ts`, which grants a
  Mine. As in Phase 1, a snapshot holding a removed Mine, Umbrite Rig or Ore
  Refinery must still load (drop the record).
- **Fields need no new stored state.** A field is derived from tiles: the
  connected component of same-resource deposit tiles. Worldgen cluster ids
  (`clustersById`) are not stored on runtime tiles, and waystation rewards add
  deposits at runtime, so the component is the source of truth.
- **Refinery record.** Store an anchor tile key (any tile of the assigned
  field) on the refinery's economic structure record; the field is the
  component containing the anchor when evaluated, so a component that grows
  or merges keeps working. If a merge puts two refineries on one component,
  the older assignment keeps it and the newer refinery shows the
  "needs a new field" toast. If the anchor tile stops being a deposit or
  changes owner, re-anchor to another tile of the same component, or show the
  toast if none is left. Commands: build with a field key, and
  `ASSIGN_REFINERY_FIELD` to change it. Validate reach and link on the
  server.
- **Link check.** Breadth-first search over the owner's land from the
  field's tiles to the town tile, capped at the reach. When a tile changes
  owner, recompute only refineries whose town lies within reach (10 tiles) of
  that tile; no path needs storing, because any tile on a valid path is
  within reach of the town. Read
  `docs/agents/state-and-persistence-discipline.md` before adding any cache;
  prefer recomputing from tiles over storing link state.
- **Slot supply.** In `apps/simulation/src/resource-slot-view/resource-slot-view.ts`
  and `packages/shared/src/resource-slot-sources/`, replace the same-tile
  Mine/Umbrite Rig bonus and the Ore Refinery radius bonus with "+2 per
  garrisoned tile of a linked, processed field" (+3 with the town's
  booster for that resource). Keep the source breakdown
  labels so the HUD explains it. Update `tile-yield-view`,
  `legacy-snapshot-economy` and `ai/food-slot-relief-surplus.ts`, which read
  the old structures.
- **Worldgen (implemented, worldgen v13).** Clusters are placed before towns
  (`season-seed-world.ts` and `season-seed-world-async.ts`), so a pass runs
  once every worldgen town is placed (after `normalizeTownPlacements()` and
  the mountain-ring interior towns, which add towns, before watchtowers and
  waystations): `applyStrategicReachGuarantee`
  (`apps/simulation/src/season-seed-world-strategic-reach.ts`) calls
  `ensureStrategicClustersInReach`
  (`packages/game-domain/src/server-worldgen-strategic-reach.ts`). Every
  strategic cluster is checked: each of its fields must have a tile within
  `REFINERY_REACH_LAND_TILES` (`packages/shared/src/refineries/`) land steps of
  a town, and no tile may sit on a town, a dock or within Chebyshev 2 of a
  town. A failing cluster is cleared and re-placed with the same resource
  (`resourcePlacementAllowed`, `collectClusterTiles`, relaxed fallback),
  preferring a spot that keeps its field size; hilltop singles move to another
  hills tile. It keeps its cluster id, uses `seeded01` with its own seed
  offset, and is left in place (one `worldgen_strategic_reach_unplaced` log
  line) if no spot is found. `CURRENT_WORLDGEN_VERSION` is 13. On seeds
  12345, 777 and 4242 it moved 48 of 136, 51 of 138 and 53 of 138 clusters
  with no failures and unchanged strategic tile totals (more than the
  prototype in Evidence, which only moved out-of-reach clusters). Existing
  worlds keep their saved deposits; settlement towns placed for players after
  worldgen are not covered. `apps/worldgen-lab` runs the same pass against its
  estimated towns.

### Client (both 2D and true-3D)

**Implemented** in `packages/client/src/client-refineries/` (2026-11-12). The
owner's client recomputes each refinery's status from its own tiles with the
shared rules, so a link cut or restored elsewhere shows at once even though
the server's `refinery` JSON only refreshes with the refinery tile; it uses
the wire status only when the town tile is not loaded. Other players see
whether a refinery is linked, but not its field, so they see no line, loads
or refined overlay for it. Per bullet: status `refinery-client-status.ts`;
line and refined tiles `refinery-scene.ts` (2D through `district-canvas.ts`
and `client-map-render-resource-overlays.ts`, 3D through `district-map-3d.ts`
and `client-map-3d-raw-resource-dispatch.ts`); goods `refinery-goods.ts`
(`refinery-canvas-2d.ts`, `refinery-goods-3d.ts`); toast
`refinery-field-toasts.ts`; pickers `refinery-picker-flow.ts`,
`refinery-field-options.ts`, `refinery-towns.ts`; picker highlight
`refinery-picker-highlight.ts` (`refinery-canvas-2d.ts`,
`refinery-highlight-3d.ts`). Stories: Map / Structures / Refineries.

- **Supply line.** A working refinery draws the same dark service line that
  support-ring buildings draw to their town (`client-town-district/`
  `district-network.ts`, `district-links-3d.ts`, 2D `district-canvas.ts`),
  continued to its field.
- **Moving goods.** Small loads travel along the line from field to refinery
  while it is processing.
- **Refined deposit.** Processed field tiles get an improved overlay reusing
  the Mine model (`client-map-3d-resource-overlay.ts`,
  `client-resource-overlay-2d/`).
- **Broken link.** Line and goods stop, the overlay goes, and a toast above
  the refinery says it needs a new field (the DOM plate layer drawn over
  both maps, like the unruly-town icon).
- **Connecting a field, from the field (main path).** Tap a deposit tile and
  choose "Refine at…": it lists towns in reach with free ring tiles and the
  slot gain; picking one places the refinery on a free ring tile (with a
  "choose tile" step).
- **Connecting a field, from the town.** Tap a support-ring tile and choose a
  refinery: the map shows the 10-tile reach and highlights the fields it
  could take with their slot gain; taken or unlinked fields are greyed with
  the reason. A single choice is picked automatically.
- **Changing field.** Tap the refinery and choose "Change field" (same
  picker); tapping the broken-link toast opens it too. Retaking the land that
  broke the link restores it automatically.
- Guard 3D-only paths with `isTrue3DRendererActive()` and check both
  branches before calling it done.

### AI

Build a refinery in the nearest town with a free ring tile for each
reachable field, preferring towns whose ring has spare tiles; reassign when a
link breaks. Extend `apps/simulation/src/ai/build/economic-synergy-scoring.ts`
and the structure planner; read `docs/agents/ai-guardrails.md` and
`docs/agents/topics/ai-planner.md` first.

### Tests

- Booster: a booster in the same town raises each processed tile to +3;
  removing or losing the booster drops it back to +2.
- Slot supply: a linked field gives +2 per garrisoned tile; unlinked gives
  base only; one field cannot feed two refineries.
- Link: cut by capture of a path tile, by water, by another player's land;
  restored when the path is retaken.
- Reach: a field at 10 land tiles is reachable, at 11 is not.
- Capture of the town, of a field tile, and of the refinery tile.
- Worldgen: every strategic field within reach of a town; none on rings;
  same seed gives the same map.
- Client: line, goods, overlay and toast in 2D and 3D adapters (implemented: `packages/client/src/client-refineries/*.test.ts`).

### Done when

In playtests, players give up ring tiles in towns near fields and fight over
the links, and a visit includes at least one refinery decision while the
empire is growing.

## Cross-cutting rules for every phase

- A regression test for every bug fix; `pnpm ci:local` before each PR.
- A `CLIENT_CHANGELOG_ENTRIES` entry for each user-visible phase.
- 2D and true-3D coverage, or a stated gap in the PR.
- Economy reference, `docs/game-mechanics.md`, `docs/core-loop.md` and lore
  updated in the same branch as the rule change.
- Keep source files under the 500-line limit by extracting cohesive helpers.

## Relation to other plans

`docs/stacking-adjacency-plan.md` (unreviewed) would make same-family
buildings in a ring earn more for touching neighbours. It answers how to
arrange a ring; this plan answers which town processes which field. Review
it after Phase 2; refineries take ring tiles, so both plans compete for the
same space.

## Evidence

**Distance today.** Land distance from strategic deposits to the nearest town
on three generated standard maps (seeds 12345, 777, 4242):

| | Titanium | Umbrite | Gems |
| --- | --- | --- | --- |
| Median | 8–9 | 6–8 | 7–8 |
| Within 10 tiles | 63–80% | 59–84% | 62–76% |
| Farthest | 16–20 | 17–20 | 16–19 |

**Worldgen prototype.** On seeds 12345 and 777 (seed 4242 was measured but
not prototyped), out-of-reach strategic clusters were cleared after town
placement and re-placed within 10 land tiles of a town using the real habitat
rules. The throwaway code ran inside `season-seed-world-async.ts` right after
`normalizeTownPlacements()` and is not part of this branch; Phase 2 rebuilds
it properly, including the ring-overlap check for clusters it does not move:

| Seed | Fields moved | Failed | Deposit tiles within reach, before → after | Within 4 tiles of a town, before → after | Towns with a strategic deposit within 10, before → after |
| --- | --- | --- | --- | --- | --- |
| 12345 | 31 of 136 | 0 | 62–84% → 88–99% | 22–28% → 26–33% | 40% → 43% |
| 777 | 37 of 138 | 0 | 59–76% → 88–92% | 12–23% → 20–30% | 36% → 42% |

The maps look almost unchanged: towns sit about every 15 tiles, so moved
fields land in the gaps rather than crowding towns.

## Open questions

- Refinery output of +2 per tile, and whether output falls with distance.
- Can a Town (not only City and above) host a refinery?
- Does Crystal get a refinery? Crystal slots feed more than Aether Towers:
  Aether Condensers, Sky Docks, Neural Works, Resonance Grid, Ambaric
  Transformer, Reserve Lattice, Ore Refinery and every Great Project part
  (`STRUCTURE_SLOT_REQUIREMENTS`).
