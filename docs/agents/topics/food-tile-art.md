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
