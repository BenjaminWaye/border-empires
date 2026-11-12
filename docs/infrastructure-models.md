# Frontier infrastructure models

Status: implementation reference

The production 3D models and **Map / Structures / Infrastructure / Identity
Review** share the same renderer factories. This phase replaces the Mine,
Harbor Exchange, Relay Beacon and Aether Tower architecture. Umbrite Rig keeps
its machinery and relative piece layout, uniformly fitted onto a marble slab.
The fortifications, siege structures and completed Great Projects are unchanged.

| Structure | Visual identity | Preserved behavior |
|---|---|---|
| Mine | Mechanised drill gantry, extraction mouth, separation housing and material tray | Titanium loads are ingots; Crystal loads are crystalline; construction/removal clipping |
| Harbor Exchange | Customs hall, watch drum, bonded cargo, gantry crane and bollards | Connected-dock Coin effect; construction/removal clipping |
| Relay Beacon | Three nested octagonal gravity-sensing frames, suspended instrument and local field projectors | Closed frame assembly, calibration motion, fixed animation slots, disabled poses and staged construction |
| Aether Tower (`OBSERVATORY`) | Swept containment piers, energy column, moving field rings and transmission crown | Native links, clusters, cooldown/siphon badges, frozen/disabled machinery and dimmed core |
| Umbrite Rig | Original drilling and containment equipment on a plain marble platform | Original relative machinery layout and material palette |

Roles, names and powers come from the current shared registry, modifier
catalogue and simulation handlers, not visual inference. No capability, cost,
resource meaning or gameplay rule is changed. Relay Beacon lore now explains
a gravitational link to the orbital House AI and a local control field whose
coverage defines settlement reach;
see the canonical world bible §10.

`client-infrastructure/infrastructure-models.ts` owns the new merged geometry.
Mine and Harbor Exchange are routed through the existing generic overlay API;
Relay and Aether retain their dedicated overlays and native animation/network
contracts. The shared district renderer batches static architecture and its
platforms, clips staged models, dims per-instance lights and disposes resources.
Internal housing IDs are visual-only; they are not added to gameplay types or
the town-support replacement/connection catalogue.

Aether Tower retains its existing frozen construction presentation: this art
change does not introduce new staged clipping for its native field machinery.
Relay, Mine and Harbor Exchange use their existing construction/removal sites.
Relay housing and its native sensing assembly share one construction height;
rigid sensing frames remain hidden until their full height has been built.

`node scripts/generate-infrastructure-icons.mjs` projects the production meshes
into all thirteen existing overlay filenames, including Titanium/Crystal Mine
and Umbrite variants. It also writes exact menu crops. Versions on map and
menu URLs invalidate earlier art. Numbered variants currently share the same
model within each resource family; resource loads remain different.

Run client TypeScript, infrastructure/model/overlay tests and Storybook checks.
Regression coverage includes resource identity, exact SVG agreement, menu crops,
construction gates, disabled-state animation, bounded draw calls, triangle and
upload budgets, disposal and the Umbrite platform. Keep both 2D canvas assets
and true-3D models in agreement whenever any of these models changes.

## Harbour (dock quay and landing slipways)

The dock tile's quay and the slipways on its landing ground are not a built
structure, but they are drawn in the same palette as the models above
(`TOWN_COLORS`): a black-and-gold marble quay on a charcoal course with a
brass inlay (the marble finish shared with town plinths), lamp posts along
the sea edge, a glazed control office with a sensor mast, an iron-plated
pier, a powered gantry crane with cyan status strips and its cell bank,
sealed containers and an armoured troop carrier. The models are written with a
small builder (`client-map-3d-harbour/harbour-model-builder.ts`: boxes,
cylinders, domes, bands and rods in the piece's frame) in
`harbour-quay-model.ts`, `harbour-slipway-model.ts` and `harbour-props.ts`,
then merged once into one geometry per material for each piece (quay, full
slipway, shrunk slipway). A placed piece is one instance on each of its
material meshes, so added detail costs triangles, never per-tile instance
memory. The capture fire (`client-wreck-models/dock-fire-model.ts`) burns on
the same layout.

The 2D sprites `dock-overlay-{1,2,3}.svg` are flat projections of the
production quay (`client-map-3d-harbour/harbour-overlay-svg.ts`, shared
projector `client-structure-info-catalog/mesh-projection-svg.ts`). Faces below a quarter of
a square sprite unit are dropped to keep the files small. Regenerate
with `node scripts/generate-dock-overlay-icons.mjs` after changing the models
and bump `overlayAssetVersion`; a regression test fails while they disagree.
The 2D slipway glyph (`client-harbour-slipways-2d.ts`) uses the same colours.
