# Connected town support buildings — implementation plan

Status: active implementation plan; visual direction accepted, production integration unshipped
Owner: Benjamin Waye (visual direction); Codex (implementation)
Last verified: 2026-10-25
Replaces: none; extends the accepted Storybook art study

Implementation progress: the production kit, all 45 remodeled models, generated
2D art, authoritative anchor projection, live renderer adapters and bounded
routing are implemented on the feature branch. The new production gallery
covers construction, removal, inactivity, dormancy, town tiers and slopes.
Focused model/network/instance tests and simulation login/reveal tests pass.
See [the implementation reference](town-support-districts.md) for entrypoints
and the measured desktop performance comparison. Full CI, actual game-client
lifecycle checks, physical mobile performance and staging verification remain
release gates; this plan is not delivered or archived yet.

## Outcome and boundaries

Remodel the complete town-support building set as one architectural family:
town-matched marble foundations, stone and dark iron buildings, aged brass,
warm windows, machinery-specific accents, and raised service connections.
Each building must remain identifiable at ordinary gameplay zoom.

The production reference is
[`TownDistrict.stories.ts`](../packages/storybook/src/map/structures/TownDistrict.stories.ts).
It replaces the accepted three-model art study with the complete catalogue,
production renderer adapters and lifecycle previews. The initial art study is
retained in this branch's Git history. Production work supports arbitrary
occupancy, town tiers, terrain, world wrapping, visibility and construction in
both renderers.

This is a presentation change. Keep costs, unlocks, support radii, assignment,
stacking, resource slots and economic effects unchanged. Existing buildings
receive the new appearance without rebuilding or moving them. Connections
are drawn automatically and require no player construction or upkeep.

The [industrial adjacency proposal](stacking-adjacency-plan.md) is separate:
this work does not introduce adjacency bonuses or make cutting a visible pipe
disable a building. Keep the renderer's relationship model replaceable if
that gameplay proposal is implemented later.

## Complete asset scope

Inventory is based on placement metadata, the active structure registry and
display names, not on which models happen to use the generic 3D dispatcher.
At verification there are **17 active ordinary town-support types plus 18
Great Project preparation types**, all requiring a complete remodel. There
are also **eight active general-purpose utilities** requiring matching art.

`placementMode === "town_support"` is insufficient: several repeatable
support buildings deliberately use `same_tile`. Use
`structureRequiresTownOrSupportTile` for town-restricted coverage and an
explicit utility/compatibility classification for the remaining structures.
Reconcile this inventory with the current registry at implementation time.

### Ordinary town support — 17 active types

| Family | Structure IDs | Model direction |
|---|---|---|
| Local industry | `MANUFACTORY` | Detailed workshop, roof lanterns, exposed drive, loading yard; finish the prototype model |
| Administration | `CENSUS_HALL`, `CLEARING_HOUSE` | Distinct registry and financial offices, civic facades and warm windows |
| Trade | `TRADE_NEXUS` | Freight/exchange hall with a recognizable cargo handling silhouette |
| Manpower | `INCUBATION_ENGINE`, `ANCILLARY_DEPOT`, `NEURAL_WORKS`, `ANCILLARY_FACTORY`, `RESERVE_LATTICE` | Distinct incubation machinery, reserve pods, control equipment, assembly hall and reserve lattice; finish the depot prototype |
| Material processing | `TITANIUM_WORKS`, `HIGH_YIELD_TITANIUM_WORKS`, `UMBRITE_WORKS`, `HIGH_YIELD_UMBRITE_WORKS` | Related industrial halls with material-specific machinery; upgrades add equipment without increasing the slab |
| Aether processing | `AETHER_CONDENSER`, `HIGH_YIELD_AETHER_CONDENSER` | Vessels, couplings and contained aether lighting; finish the prototype and define its upgraded form |
| Weapons production | `TITANIUM_WEAPONS_FACTORY`, `UMBRITE_WEAPONS_FACTORY` | Related arsenals with visibly different process machinery and ordnance |

### Great Project preparations — 18 active types

Every listed part gets a distinct model on the shared support foundation,
not one generic placeholder repeated three times. Keep its established role
and existing completion/consumption lifecycle.

| Project | Part IDs | Existing display names, in part order |
|---|---|---|
| Imperial Exchange | `IMPERIAL_EXCHANGE_PART_1/2/3` | Golden Ledger; Counting Engine; Sovereign Seal |
| Sovereign Siege Engine | `SOVEREIGN_SIEGE_ENGINE_PART_1/2/3` | The Long Barrel; Fracture Core; Sky-Marking Array |
| Aegis Dome | `AEGIS_DOME_PART_1/2/3` | Shield Lattice; Ward Anchor; Aegis Crown |
| Astral Dock | `ASTRAL_DOCK_PART_1/2/3` | Launch Cradle; Orbital Array; Aether Sail |
| Census Directorate | `CENSUS_DIRECTORATE_PART_1/2/3` | Census Engine; Registry Vault; Levy Charter |
| The Titanium Levy | `TITANIUM_LEVY_PART_1/2/3` | Muster Klaxon; Titanium Standard; Levy Writ |

The shorthand `PART_1/2/3` above represents three separate existing IDs.

### General utilities and compatibility

| Category | Types | Treatment |
|---|---|---|
| Eight active utilities | `HYDROWORKS`, `ORE_REFINERY`, `MINISTRY_HALL`, `RESONANCE_GRID`, `SKY_DOCK`, `AMBARIC_TRANSFORMER`, `RELAY_BEACON`, `OBSERVATORY` (Aether Tower) | Remodel to match the family everywhere they occur; use town service sockets when on an assigned support plot. Preserve their independent effects, animations and targeting |
| Retired saved structures | `WEAPONS_WORKSHOP`, `QUARTERMASTERS_OFFICE` | Supply matching compatibility variants; preserve saved identities/effects and keep them unavailable for new construction |
| Completed Great Projects | `IMPERIAL_EXCHANGE`, `SOVEREIGN_SIEGE_ENGINE`, `AEGIS_DOME`, `ASTRAL_DOCK`, `CENSUS_DIRECTORATE`, `TITANIUM_LEVY` | Preserve their monumental silhouettes and special footprints; adapt materials/foundations and provide a compatible service endpoint where appropriate, rather than shrinking them into an ordinary workshop |
| Fortifications and siege assets | `FORT`, `TITANIUM_BASTION`, `THUNDER_BASTION`, `PALISADE`, `SIEGE_BATTERY`, `SIEGE_TOWER`, `DREAD_TOWER` | Preserve military models and placement rules; handle co-location and route clearance explicitly. These do not become town-dependent utility buildings |
| Resource/dock structures | Mine, Hydrogarden, Umbrite Rig, Harbor Exchange and other non-town-support structures | Preserve terrain/dock-specific placement and appearance; prevent district foundations and links from covering their models or routes |

Merely allowing an asset on a support tile does not make it economically
dependent on that town. Generic utility links represent visual services,
not a new power, freight or supply requirement. A standalone utility keeps
its platform without drawing a speculative town connection.

## Shared visual contract

Create a production-owned kit under a dedicated client directory, with
Storybook importing that kit. Do not ship code that imports production
rendering from Storybook. Extract reusable pieces from the town builders
without destabilizing the existing town tiers.

- **Foundations:** use the prototype's 0.38-tile octagonal support radius as
  the starting standard. Towns retain their tier-specific footprint. Marble
  tops, flared foundations, brass courses, paving and edge details share one
  material system. Test the complete footprint, including skirts and props.
- **Height and scale:** define ordinary-building height bands and explicit
  landmark exceptions. Keep machinery, doors, windows, lamps and crates at a
  consistent scale. Review against both Town and Metropolis; avoid a blanket
  scale multiplier on unrelated old models.
- **Sockets:** eight stable edge/diagonal attachment positions, with the
  prototype's 0.075 local service height as the starting value. Ports belong
  to the platform coordinate frame; building rotation cannot move them.
  Finalize these dimensions in the terrain-aware vertical slice.
- **Identity:** every ordinary building and Project part receives its own
  remodeled silhouette and detailed machinery. Share architectural parts,
  not interchangeable complete building bodies.
- **Upgrades:** high-yield variants use the same footprint and socket layout;
  add unmistakable equipment/capacity details and update their 2D icons.
- **Lighting:** warm service indicators and windows unify the district;
  reserve aether effects and material accents for appropriate machinery.
- **Empty plots:** retain the quiet selected-town preparation markers.
  Permanent slabs are occupied-building foundations, not eight or twenty-four
  bulky empty platforms. Do not superimpose a glowing hatch on a new slab.
- **Zoom:** retain silhouette, slab outline and main links at gameplay zoom;
  reduce small props, steam and decorative animation at lower quality tiers.

Read the [lore index](lore/README.md) and world bible §§3, 5, 11–13 when
finalizing models. Keep Manufactory output as goods, retain the distinction
between local buildings and AFC modules, and preserve Project-part meaning.
Service lights do not establish a new universal aether dependency.
**Lore reviewed; no canon change** for the current visual direction. Update
the world bible in the same branch if later art changes imply new fiction.

## Assignment and routing

### Authoritative relationship, shared by both renderers

Use actual town assignment, not the nearest visible town or the selected
town's highlighted support plots. Current assignment selects the eligible
same-owner settled non-Settlement town with lowest world x, then y; range is
tier-aware and wraps across world seams. Town/City have radius 1; Great
City/Metropolis have radius 2. Do not hardcode eight buildings or eight ports
as a cap on connected destinations.

The current selected-town plot lookup is not sufficient evidence of economic
assignment, and the gateway's estimated tile-detail fallback deliberately
omits that assignment. Client streams can also lack a competing town near
the viewport edge. Avoid inventing a second approximation in the renderer.

Preferred implementation: derive an additive, optional connection-anchor
field in the authoritative simulation subscription/patch path, using the
existing assignment resolver. Propagate it through sim/client protocols and
client state. Include coordinates only when the endpoint is already known
to the viewer; distinguish unavailable knowledge from a confirmed absent
anchor. Missing data must suppress speculative links rather than guess.
Keep it derived, not persisted in world checkpoints. Refresh affected nearby
tiles on ownership/tier/structure changes and subscription reveal/hide.

Keep relationship calculation bounded to changed/visible neighbourhoods.
If extracting a shared assignment helper is necessary, prove parity with
both existing simulation assignment consumers before replacing them.

### Deterministic service network

- Build a renderer-neutral connection description from known assignments,
  occupied platforms, socket positions and route constraints. Renderers
  consume the same endpoints, segment IDs and state; 3D adds terrain heights.
- Use reusable straights, bends, junctions, posts and platform adapters.
  Share tile-edge corridors between buildings belonging to the same town;
  prune unused branches. A full first ring should retain the prototype's
  service-ring appearance, while sparse plots remain sparse.
- Extend the corridor layout to distance-two plots. Use fixed corridor/port
  positions and deterministic tie-breaking so adding a building does not
  make unrelated links jump or rotate existing buildings.
- Route around occupied models, roads and protected footprints. Account for
  co-located forts and independently rendered utility models. Keep different
  towns' networks logically separate and avoid duplicate crossing geometry.
- Terrain must not silently change support eligibility. Where a valid
  relationship cannot get a clear surface route, represent a buried service
  connection with endpoint risers; show its dashed relationship when selected
  in both renderers. Do not label the building unsupported or disable its
  effect because decorative routing failed.
- Never reveal hidden buildings or trace a route through unexplored ground.
  Clip at visibility boundaries; show frozen remembered detail under fog only
  to the same extent as existing building rendering. Do not reveal current
  hidden state through moving lights or re-routed links.

### Terrain and lifecycle

Seat each slab using the actual terrain under its footprint. Use a foundation
skirt or localized terrain cut consistent with current building seating; do
not raise every town and building by the art study's fixed 0.1 offset.
Adapt pipe supports, gradients and risers between different platform heights.
No floating slab undersides, buried machinery, water-spanning marble pads or
links through hills. Preserve forests/resources and existing road clearance.
Reuse the town's own foundation when a utility or older saved structure shares
its tile; define a compatible placement/port adapter instead of drawing two
overlapping slabs or relocating the saved structure.

Keep completed geometry after a town is lost; withdraw/reassign its links
according to authoritative state. Construction uses the existing phased build,
crew, scaffolding and AFC delivery system; show a foundation/connection stub
until the building is ready. Removal dismantles the appropriate pieces.
Retain geometry for inactive/dormant buildings, dim operational effects, and
preserve existing status badges. Converters must still express their mode.

Town upgrades, downgrades, captures, demolition, Project-part consumption,
reconnect and out-of-order partial knowledge must all update the district
without stale links or changing the underlying rules.

## Delivery phases

| Phase | Work | Exit criterion |
|---|---|---|
| 1. Production kit and coverage manifest | Extract shared geometry/material/port helpers; define typed asset coverage and states; create a gallery for all 35 support types, eight utilities and compatibility cases | Complete catalogue with no implicit old-model fallback; platform bounds, ports and scale contracts tested |
| 2. One live vertical slice | Port the three prototype models; add authoritative anchor metadata, terrain seating and the shared graph; connect them in 3D and 2D | A real sparse/dense district works on flat and hilly terrain, wraps correctly, survives capture/reconnect, and preserves economy |
| 3. Remodel ordinary support set | Finish all 17 ordinary types, including upgraded converters, civic, manpower, trade and weapons families; produce matching 2D icons | Every ordinary type appears in the gallery and the live map with distinct, consistent art and all lifecycle states |
| 4. Complete remaining asset coverage | Remodel all 18 Project parts and eight utilities; integrate completed Projects, retired structures and military coexistence | Coverage test passes for the complete matrix; special overlays cannot bypass slabs, ports or state handling |
| 5. Finish routing and interaction | Complete radius-two networks, overlapping towns, obstacles/buried routes, visibility clipping, selection emphasis, quality tiers and incremental rebuilds | Both renderers agree for every routing fixture; dense and changing worlds have stable, readable networks |
| 6. Validate and release | Run full checks, performance comparisons, visual review and live gameplay checks; add changelog/docs; land through develop and verify staging | Acceptance checklist below passes; production promotion follows the existing release runbook |

Phases are dependency-ordered. Complete the vertical slice before mass model
production, so terrain/port problems do not require remodeling the whole set
twice. Every phase that changes live visuals includes its corresponding 2D
implementation in the same branch. Do not call a partial gallery or a
three-building port the complete feature.

## Implementation entrypoints and engineering constraints

| Boundary | Existing entrypoints |
|---|---|
| Scope and identity | `packages/shared/src/structure-placement.ts`, `structure-placement-metadata.json`, `structure-registry-economic.ts`, `structure-display-names/` |
| Authoritative assignment | `apps/simulation/src/town-support-lookup.ts`, `economy-network/economy-network-support-ring.ts`, `runtime-structure-town-support-target.ts` |
| Client plot markers | `packages/client/src/client-town-support-plot-lookup.ts`, `client-map-3d-town-support-tile/`, `client-map-2d-town-support-tile-overlay.ts` |
| Building integration | `packages/client/src/client-map-3d/client-map-3d-building-instances.ts`, `client-map-3d-structure-overlay/`, `client-map-3d-structure-builder.ts`, family model modules and dedicated overlays |
| Town geometry and finish | `packages/client/src/client-map-3d-town-overlay/`, `client-map-3d-muster-banner/muster-banner-marble-material.ts`, `client-map-3d-building-envmap/` |
| Construction | `packages/client/src/client-map-3d-construction/`, `client-construction-phase/`, `client-construction-2d/` |
| Renderer dispatch | `packages/client/src/client-map-3d/client-map-3d.ts`, `client-runtime-loop.ts`, `client-renderer-mode.ts` |

Use explicit typed dependency interfaces. Extract cohesive helpers before
editing oversized integration files; obey the 500-line source growth limit.
Keep new tests beside their owning modules, not at package `src/` roots.

Bake model geometry once per kind/quality variant and use instancing/batching
for the live map. The art study's per-placement meshes are not a production
architecture. Do not allocate material/geometry per visible building or pipe.
Update continuous animation from the frame clock; panning must not restart it.
Use camera-relative positions correctly across origin shifts and world seams.

Rebuild relationships/routes on relevant state, visibility and terrain changes,
not by scanning every town or the world each frame. Bound route caches and
instance storage by explicit capacity, expose counts/overflow diagnostics,
clear them on world/session replacement and dispose GPU resources. Follow the
[state discipline](agents/state-and-persistence-discipline.md).

## Verification and acceptance

- [x] Coverage test derives eligible types from placement/registry data and
  fails when a current or newly introduced support type lacks a visual
  definition, upgraded variant or matching 2D icon. Explicitly cover dedicated
  render paths such as Umbrite Weapons Factory, Trade Nexus and utilities.
- [ ] Geometry checks include props, skirts, transformed sockets, upgrade
  footprints, construction bounds and declared height-band exceptions.
- [ ] Assignment fixtures match simulation results for radius 1/2, diagonal
  plots, overlap tie-breaks, both world seams, Settlements and ownership loss.
- [ ] Protocol/integration fixtures cover initial subscription, anchor/tier
  changes, knowledge clipping, reconnect, incomplete payloads and older clients.
  No hidden town coordinates or hidden state changes leak through the new field.
- [ ] Graph fixtures cover one/all/zero buildings, repeated types, isolated
  second-ring buildings, mixed town ownership, obstacles, buried links, branch
  pruning and stable unaffected segments after a local edit.
- [ ] Both renderers show identical relationships and lifecycle states;
  selection shows one coherent town network. Grep
  `isTrue3DRendererActive()` and inspect both integration branches before
  reporting parity. Keep overlays from obscuring selection, targeting or clicks.
- [ ] Storybook includes every model, all town tiers, mixed/repeated districts,
  upgrades, terrain/biome samples, empty/full 24-plot rings and all statuses.
  Compare front/side/back views, daylight/night and actual gameplay zoom.
- [ ] Live checks cover build, pause, completion, dormancy/recovery, converter
  mode, upgrade, demolition, town/structure capture, Project completion and
  reconnect. Verify the actual UI/client path, not just gallery rendering.
- [ ] Compare baseline/candidate on the same desktop and lower-end/mobile
  fixtures. Record frame time, rebuild time, draw calls, triangles and GPU
  resource counts; proposed gate is no more than 10% p95 regression on those
  fixtures, no unbounded growth during repeated pan/build/remove cycles, and
  no permanent performance loss after switching worlds.
- [ ] Run focused model/graph/protocol tests first, then `pnpm ci:local`
  before the feature PR and `pnpm --filter @border-empires/storybook
  storybook:build`. At planning time the full Storybook build is blocked by
  an unrelated missing `client-capture-mustering-style.css` import in
  `GroupedBuildingMenu.stories.ts`; resolve or confirm it is fixed before the
  release gate. The prototype's focused bundle and Storybook type check pass.
- [ ] Append a player-facing entry with `createdAt: Date.now()` to
  `packages/client/src/client-changelog/client-changelog-data.ts` for each
  shipped visual increment. Review README and update affected gameplay/rendering
  references, then archive this plan when delivered.
- [ ] Merge through `develop`, verify green CI and the automatic Hetzner
  staging deployment, and inspect real districts in both renderers. Production
  promotion follows [the deploy runbook](agents/deploys.md); no direct pushes
  to develop/main and no Vercel deployment from Hetzner CI.

The complete feature is delivered only when the asset coverage matrix,
terrain/lifecycle handling and both renderer implementations pass together.
The next work is completing the remaining validation and release gates;
implementation entrypoints and measured results are recorded in the reference.
