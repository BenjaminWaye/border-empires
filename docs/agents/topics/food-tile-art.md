# Farm and fishing tile art

Status: task reference

The shipped 3D food overlays use `farmland-detailed.glb` and `fishing-site.glb`.
The original `farmland.glb` and `fishing2.glb` remain untouched source exports.
The farm retains one instanced mesh, baked ambient occlusion and surface grain.
Rebuild it (and the intermediate `fishing-detailed.glb` art reference) with
`node scripts/bake-food-tile-models.mjs`. Baking runs offline only.
Preserve crop-bed height: battle marines use `FARMLAND_STAND_LIFT`.

The approved fish site uses the intact Blender proposal uniformly scaled to 80%,
with its original holding basins and loading hoists. It has three material
layers and a fourth instanced layer for the plain gray apron. See the approved
runtime integration below for placement, material and lifecycle details.
Retain `DoubleSide` for the original open/reflected surfaces. Do not introduce
wooden bridges, drying racks or boats between the tanks.

The 2D fallback loads three SVG variants per resource from `public/overlays/`.
Both renderers must be maintained when changing these food tiles. Review the
Farmland, Fishing and Food tiles 2D stories under Map/Resources in Storybook.
Fishing comparison shows the untouched source and current asset with the same
camera, lighting, orientation and footprint; the added wooden bridge is removed.
Focused checks: client Vitest directories `client-map-3d-merged-glb`,
`client-map-3d-farmland` and `client-map-3d-fishing`, plus client/storybook lint.

Lore reviewed; no canon change. This is a visual update to existing production
sites, with no change to resource output, buildings or capabilities.

## Blender style study (27 October 2026, authoring history)

The initial Blender study was a proposal; its approved smaller derivative is now integrated below. Export the
actual Hydroworks and Manufactory reference geometry with
`node scripts/export-food-style-reference.mjs <output-directory>`, then run
`blender --background --factory-startup --python scripts/blender-fish-basin-study.py -- <repo-directory> <output-directory>`.
It saves an editable `.blend`, a proposal close-up and a Cycles comparison
with the actual production reference structures. The current fish asset is
retained as a hidden reference collection in the Blender file.

The proposed direction keeps both basins, their loading hoists and the open gap.
Use the town palette: cool stone machinery feet and control house, dark iron
basin walls, restrained aged-brass rims and hoists, and blue water. Narrow ribs
and small bevels provide manufactured edges without adding a bridge, a new
building, or luminous aether machinery.

The current food overlay merges everything into one non-metallic material.
For implementation, preserve separate instanced body, metal and water layers,
following the district material responses, instead of baking metal into matte
vertex colours. Update the 2D artwork in the same branch when adopting the study.

### On-terrain foundation review

The Fishing terrain study story compares the Blender proposal directly on the
production grass heightfield with a low gray stone apron. The apron has a level
top and a chamfered skirt fitted to the terrain corner heights, leaving a grass
margin inside the tile. It is an art preview only, not a runtime overlay.

Export the proposal with `blender --background <study.blend> --python scripts/export-blender-fish-study.py -- packages/storybook/public/studies/fishing-style-proposal.glb`.
Study assets are served under `/studies` by Storybook and are excluded from
the game client's public directory. The preview passes its renderer to the
atmosphere so the metal and water use the production building environment map.

The gray apron makes the disconnected props read as one work site. Keep it
thin and rough, with subdued contrast against the surrounding grass; avoid
a tall display plinth or a wooden bridge. Minor drainage/wear could further
ground the basins if this direction is adopted in both game renderers.

`Map/Resources/Fishing game context` places the proposal and apron beside a
coast, production towns, Hydroworks, Manufactory, farmland and forests. It uses
the production perspective camera tilt, heightfield, animated sea and atmosphere
without studio lights. Coastal settlement and Close up support art review;
Gameplay zoom uses the default game's approximate camera distance (38).
This remains a 3D preview, with no runtime or 2D replacement. The wider context
exposes the apron's plain surface and the sparse hut/service area compared with
the district buildings; refine these before adopting the proposal.

### Smaller intact assembly trial (28 October 2026)

The game-context story defaults to the intact Blender proposal scaled uniformly
to 80%. The apron width is 0.736 tiles instead of 0.92 (20% narrower), with only
0.003 extra lift and a clean, even matte gray material. The compact GLB
is centered without applying the runtime footprint fit, which would enlarge it
again. Basins, hoists, baskets, hut and supplies all retain their original
relative positions and proportions. No wooden bridge is introduced.

An earlier attempt moved the individual parts closer together and added a roof
cap and supply stack. That crowded the hoists against the hut and was rejected
in visual review. Those layout edits are removed; judge the uniform scale first.

Generate this alternative from the original saved Blender study with:
`blender --background <original-study.blend> --python scripts/compact-blender-fish-study.py -- packages/storybook/public/studies/fishing-style-compact.glb <compact-study.blend>`.
The `Previous footprint` story retains the earlier full-size layout at the same
camera distance as `Close up`; the `compact` control switches between them.
The asset regression check compares component dimensions and positions relative
to the assembly center against the original, scaled by 0.8. It fails against the
rearranged asset and passes against the intact scaled assembly.
This remains a preview only: neither the live 3D overlay nor the 2D fallback is
replaced. Lore reviewed; no canon change.

The smaller site is shifted 0.132 tiles toward the east shoreline as one
assembly: model and its original compact apron move together, so the apron edge
meets x=1. The apron is not stretched. The initial apron-only extension was
superseded by this placement correction.

The slab-joint cross and edge drainage stripe were removed after map-scale
review: they read as graphic marks instead of surface detail. Keep the apron quiet.

The compact apron uses a solid matte gray material, with no noise texture or
damp patches, following the request for a cleaner surface.

## Approved runtime integration

The smaller intact assembly is now the shipped fish model at
`packages/client/public/models/fishing-site.glb`. The game-context story uses
`createFishingOverlay` directly for its smaller variant, so the reviewed scene
exercises the production renderer. Body, metal and water are merged into three
shared geometries with distinct material responses; all sites share those
geometries. A fourth instanced layer supplies the clean, uniform gray apron.
Its skirt is buried below the lowest sampled terrain corner; the top remains
level at the existing site surface plus 0.003. This avoids terrain gaps without
allocating geometry per tile. Materials and instance buffers are disposed per
overlay; the three shared model geometries remain a fixed page-lifetime cache.

Both model and apron shift 0.132 tiles toward edge-adjacent water. Diagonal-only
placements use 0.01 to keep the rotated chamfered apron inside its tile. Inland
sites retain their stable rotation and stay centered. The original component
layout is preserved; there are no racks, bridges, cross-shaped joints, edge
stripes, noise maps or damp patches on the fish apron.

The 2D fallback uses the smaller sprite scale, clean gray foundation, cool
stone/iron/brass/blue palette and the same shoreline offset. Its isometric
sprite orientation remains fixed, as with the other 2D resource artwork.
Farms retain the earlier baked shading and surface grain. The Blender and
full-size study assets remain authoring references; they are not game URLs.
