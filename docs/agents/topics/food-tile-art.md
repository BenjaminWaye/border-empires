# Farm and fishing tile art

Status: task reference

The 3D food overlays use `farmland-detailed.glb` and `fishing-detailed.glb`.
The original `farmland.glb` and `fishing2.glb` remain untouched source exports.
Rebuild both detailed assets with `node scripts/bake-food-tile-models.mjs`.
The script adds the small props in `scripts/food-tile-detail.mjs`, adjusts the
palette, bakes deterministic hemisphere ambient occlusion into vertex colours,
and generates box-projected UVs. Baking takes a few minutes; it never runs in
the client. Each result remains one instanced mesh and one draw call per family.

The merged GLB loader must retain baked colour and UV attributes. The food
material uses one small mipmapped procedural grain texture for bump and roughness;
disposing the material releases that texture. No new animation or frame-loop work
is needed. Preserve crop-bed height: battle marines use `FARMLAND_STAND_LIFT`.
Fishing sites retain the original holding basins and loading hoists. Do not add
wooden bridges, drying racks or boats between them.
The source export has double-sided surfaces; retain `DoubleSide` so the open
basins and hoist components remain visible. Fishing props face adjacent water through the existing `fishingYawFor` function.

The 2D fallback loads three SVG variants per resource from `public/overlays/`.
Both renderers must be maintained when changing these food tiles. Review the
Farmland, Fishing and Food tiles 2D stories under Map/Resources in Storybook.
Fishing comparison shows the untouched source and current asset with the same
camera, lighting, orientation and footprint; the added wooden bridge is removed.
Focused checks: client Vitest directories `client-map-3d-merged-glb`,
`client-map-3d-farmland` and `client-map-3d-fishing`, plus client/storybook lint.

Lore reviewed; no canon change. This is a visual update to existing production
sites, with no change to resource output, buildings or capabilities.

## Blender style study (27 October 2026)

The Blender study is a proposal, not a runtime asset replacement. Export the
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
