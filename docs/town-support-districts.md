# Connected town support buildings

Status: implementation reference; pending merge and staging verification
Owner: Benjamin Waye; implementation maintained with the client map
Last verified: 2026-10-25

## Presentation contract

Town-support buildings share octagonal marble foundations, dark iron and
stone, aged brass, warm windows and stable edge service sockets. The client
catalogue contains 45 remodeled types: 17 ordinary support structures, 18
Great Project preparations, eight general utilities and two retired saved
structures. Completed Great Projects retain their monumental models and
participate through service endpoints; fortifications retain their models.

Every model is generated from the same geometry kit as the towns. Geometry
is baked per kind/foundation variant and batched with instancing. The 2D
fallback uses SVGs exported from those production models and the same logical
connection graph. Preparation markers remain visible on empty selected-town
plots; occupied district foundations replace the hatch marker.

Connections are automatic visual services. They have no construction action,
cost, upkeep, supply requirement or combat/economic effect. Placement,
resource slots, bonuses, stacking and support radius remain the simulation's
existing rules. The [adjacency gameplay proposal](stacking-adjacency-plan.md)
is separate.

The active simulation chooses the anchor town using its existing assignment
resolver. Per-viewer login and delta projections attach optional
`supportAnchor: { x, y } | null` metadata to economic/observatory JSON records.
Absent metadata means unavailable knowledge or an older server; null confirms
no assigned town. The renderer never guesses an anchor from visible neighbours.
Both renderer adapters use the existing compact town identity while its detailed
economy summary is loading, so a fresh login does not wait for a town click.
No domain state/checkpoint is mutated and no new protocol field number is
required: the existing optional JSON overlay fields carry the metadata.

Anchor coordinates are emitted only while the viewer can see the anchor.
Town changes refresh nearby visible building overlays even if the buildings
did not mutate. A hidden competing town is never replaced by a guessed visible
competitor. Both endpoints and route samples must be currently visible before
drawing a surface link; remembered structures retain the existing fog policy.

## Visual identity and technology

The family depicts a highly advanced, spacefaring civilization. Precision
actuators, sealed material-processing vessels, optical data cabinets, magnetic
drives, contained aether instruments and ceramic cargo cases sit within the
towns' established stone, dark metal and restrained brass architecture. Thermal
exhaust is industrial cooling; timber crates, paper-feed machinery and exposed
clockwork are not the visual basis of the new production kit. This art direction
does not introduce propulsion mechanics or new capabilities.

Each of the 45 models has distinct massing and a large identifying assembly.
Titanium processing uses a low rolling mill; Umbrite processing uses a tall
sealed retort. Weapons factories use a rectangular press and a forked containment
crucible respectively. High-yield plants add substantial elevated processing
frames or paired recovery towers, so upgrades remain legible without colour.
The civic set separates a record tower, circular colonnaded exchange and
provincial provisioning court. Retired logistics art is isolated from the
current-building review. Instruments, reserves and Project commissions have
their own outlines instead of sharing a generic tower or factory shell.

`IdentityReview` in the production Storybook is an orbitable, lit 3D inspection
of the 43 current buildings, with a verified gameplay role and visual brief
beside each model. `RetiredCompatibility` separately displays the two retired
save types. The primary review never lists those as current buildables. A regression guard rasterizes the actual
uncoloured model geometry from three camera directions, excludes shared slabs
and effects, and compares all 990 pairs. Any pair with more than 86% combined
silhouette overlap fails. This catches near-duplicate massing; human review at
gameplay zoom still matters. The existing footprint, height, material-layer and
3,000-triangle budgets remain enforced for every model. The revised catalogue
peaks at 2,848 triangles, six layers and 0.555 tile units in height.

## Verify the building before designing it

Do not infer a building's purpose from its name, an older model, an AI planner's
build preference, or historical tech names. Audit the current implementation
before making its visual brief:

1. `packages/shared/src/structure-registry-index.ts` and
   `structure-registry-economic.ts` establish whether it is buildable.
   Quartermaster's Office and Weapons Workshop are retired save-compatible
   types, not current construction options.
2. `packages/shared/src/config.ts`, simulation build-completion/population
   modules and the `game-domain/structure-modifier-catalog/` establish effects.
   Incubation Engine grants +10,000 population once and +10% ongoing growth;
   FOOD is its input slot, not an output or food-efficiency effect.
3. The lore bible establishes fiction. Current Project component descriptions
   identify the commissioned part: Orbital Array is a tracking dish, Shield
   Lattice is a hexagonal panel, Census Engine is a rotary population index.
4. Record the resulting role and large identifying assembly in
   `district-model-briefs.ts`, then review the actual 3D model. Population
   briefs reuse the constant-backed structure description so they cannot
   contradict the menu's corrected figures.

The previous food claim for Incubation Engine and growth claim for Census Hall
were stale menu copy. They have been replaced, with failing-before/passing-after
regressions in `client-population-structure-info/`. Use the
[population reference](product/resource-and-manpower-economy.md#incubation-engine-and-census-hall)
for the current source trail.

## Routing, terrain and lifecycle

Tile-boundary corridors use deterministic bounded searches, shared segments,
corners and service posts. Radius-two towns can connect all 24 surrounding
plots. Shared edges are deduplicated and sorted independently of payload order.
World seams use the short wrapped displacement in both renderers.

Where mountains, protected footprints, forts or other obstacles prevent a clear
surface route, endpoint service risers represent a buried connection. Selecting
the town/building shows a dashed relationship where the intervening ground is
visible. A buried or visually omitted route never disables the building.

Platforms seat against the terrain footprint, while corridor supports follow
the local surface. Shared town/fort tiles use compact building placement and
a shared foundation rather than overlapping full-sized slabs. High-yield
variants retain the same slab footprint and add distinct equipment.

Construction/removal uses the existing phase, scaffold, crew and AFC delivery
presentation. A per-instance height cut controls the merged model and its shadow;
in-progress and inactive machinery stop moving and operational lighting dims.
Dormancy retains the building with reduced effects. Existing cooldown, resource
and status indicators remain in their normal overlay paths.

## Entry points

- `packages/client/src/client-town-district/district-catalog.ts`: explicit
  remodeled-kind and completed-Project classifications.
- `support-model-core.ts`, `support-model-industry.ts`,
  `support-model-projects.ts`, `support-model-utilities.ts` in that directory:
  shared fittings and distinct models.
- `district-geometry.ts`, `district-materials.ts`, `district-overlay.ts`:
  baked geometry, shared finishes, construction cuts and lazy instance storage.
- `district-network.ts`: common relationship graph and bounded corridor routing.
- `district-map-3d.ts`, `district-links-3d.ts`, `district-canvas.ts`: live renderer
  adapters, seating, selection emphasis and cleanup.
- `apps/simulation/src/town-district/town-district-projection.ts`: authoritative
  per-viewer anchor projection and local refreshes.
- `packages/storybook/src/map/structures/TownDistrict.stories.ts`: complete catalogue,
  first/second rings, slopes, construction, dormancy and 2D previews using
  production modules.

Add new support kinds to the catalogue and model dispatch; the coverage test
fails when a town-restricted placement type lacks a model. Preserve the explicit
utility, military, Project and saved-structure classifications when changing
placement metadata. Do not infer visual scope from `placementMode` alone.

## Verification and regenerating art

After changing model geometry, run from the repository root:

```bash
node scripts/generate-town-district-icons.mjs
pnpm --filter @border-empires/client exec vitest run src/client-town-district
pnpm --filter @border-empires/simulation exec vitest run src/town-district
pnpm --filter @border-empires/storybook lint
pnpm --filter @border-empires/storybook storybook:build
```

The generator uses the installed Vite dependency, writes static SVGs under
`packages/client/public/overlays/town-district/`, and removes its temporary
bundle. It also writes measured vector crop bounds for build-menu and Manifest
thumbnails, so the new art fills the existing slots. The geometry test checks
tile bounds, the 3,000-triangle/six-layer budget, height bands and exact agreement
between generated assets and the model source. Network tests cover both seams,
second rings, hidden data, loss of town ownership and buried routes.

The retained generic structure-piece builder now allocates instance buffers on
first placement or explicit mesh access. Registering or measuring an unused
legacy model no longer reserves a full visible-window buffer. District storage
is capped by visible instances and a finite catalogue; overflow counters and
instance/slot counts are exposed through the renderer adapter diagnostics.
Reduced 3D quality omits decorative steam and ground-light layers. Superseded
dedicated overlays also defer allocation until an explicit legacy/demo placement;
normal district rendering does not reserve their unused instance buffers.

The Storybook `PerformanceComparison` and `ReducedQualityComparison` stories
compare the existing production model dispatcher against the district adapter
on the same 24-building ordinary-support fixture and camera. The button warms
20 frames, measures 60 frames with `gl.finish`, and prints frame times, draw
calls, triangles, resources and cold creation time. This isolates the model
change; it does not represent a full game frame or physical mobile hardware.

Latest local desktop sample, 2026-10-25, during the full client test run
(millisecond timers are quantized and background CPU contention was present):

| Measurement | Existing, full | District, full | Existing, reduced | District, reduced |
|---|---:|---:|---:|---:|
| p95 completed frame, ms | 8.9 | 0.3 | 5.4 | 0.3 |
| Draw calls | 200 | 103 | 200 | 83 |
| Triangles | 31,260 | 64,794 | 31,260 | 62,634 |
| Uploaded geometries | 267 | 101 | 267 | 81 |
| Cold creation, ms | 45.4 | 46.8 | 16.6 | 38.1 |

The samples have fewer draw calls and show no frame regression in this local
fixture. Baseline p95 varied widely with background load (0.6–8.9ms across
runs); draw counts are the more stable comparison. These elapsed times are
local observations, not a device-independent speedup estimate. More triangles
are offset by fewer draw calls, while cold creation costs more. Geometry is
reused across subsequent rebuilds. Physical lower-end/mobile measurements and
full-client build/remove lifecycle checks remain release validation work.
Fresh-login rendering and panning have been checked through an isolated local
gateway and simulation; the existing world/economy is not used for that fixture.

Run the repository's full local CI before a PR. Review live districts in both
renderers after the Hetzner staging deployment. Preserve the current world and
economy across deployment; no saved-state migration is required.

Lore reviewed; no canon change. The models retain local production, AFC assembly
and established Project-part roles from the [world bible](lore/galactic-lore.md).
