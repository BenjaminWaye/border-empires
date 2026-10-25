# Completed Great Project models

Status: implementation reference; reviewed in 3D, awaiting merge

The six completed Great Projects use `client-monuments/monument-models.ts` and
are rendered through the shared district geometry/material/construction pipeline.
The production map and the orbitable Storybook **Map / Structures / Monuments /
Identity Review** use these same meshes. The original generic layouts remain
compatibility fixtures; they are not the current live-map dispatch.

| Current project | Identifying machinery and massing |
|---|---|
| Imperial Exchange | Colonnaded financial rotunda, ribbed gold roof, ledger-vault wings, counting court and sovereign seal |
| Sovereign Siege Engine | Massive elevated accelerator barrel and open bore, armoured collars, trunnions, recoil pistons and caged rear Fracture Core |
| Aegis Dome | Transparent hemispherical shield, meridional lattice ribs, six grounding anchors and apex crown |
| Astral Dock | Four curved launch arms, suspended satellite with four framed crystalline sails and a tracking dish |
| Census Directorate | Tall seven-drum citizen index, continuous crescent archive, reading columns and a recessed civic entrance |
| The Titanium Levy | Armoured assembly hall, muster gate, Titanium Standard, three klaxon mouths, deployment court and levy-writ terminal |

These are architectural representations of existing Project roles and named
components. Gameplay names, effects, costs, power requirements and abilities
come from the shared registry, game-domain constants and simulation handlers.
Descriptions in `client-structure-info-catalog/structure-model-briefs.ts` retain
those verified roles. Lore reviewed; no canon change.

Both renderers are covered: the live Three.js district adapter handles all six
project IDs, and existing 2D overlay URLs receive deterministic projections of
the new production meshes. Run `node scripts/generate-structure-review-icons.mjs`
to regenerate all six SVGs and their exact build-menu crops. Versioned card/menu
URLs and the map-overlay cache version prevent old artwork remaining cached.

Tests cover all six production routes, exact 2D export agreement, terrain-path
dispatch and resource disposal. All fifteen pairs are compared as monochrome
silhouettes from three views without their shared foundation. Models must remain
within a 0.405-unit half-footprint, below 0.8 units tall, and within 6,000 triangles.
Construction, removal, dormancy, shared-tile placement and selection use the
existing district lifecycle rather than a separate monument-specific renderer.

The detail audit also covers actual occlusion and support geometry: the launch
arm light strip sits on the housing surface, upper Exchange ribs follow the
roof curvature, siege trunnions connect to anchored recoil beds, and the muzzle has a recessed
open cavity. The Aegis field has its own transparent material and does not cast
an opaque shadow. Smooth metallic shading is restricted to the six monuments;
approved support-building materials retain their existing settings. Rear service
hatches, framed sail panels, joint collars and connected footings are included.

The previously excluded Fort, Relay Beacon, Aether Tower, Umbrite Rig, Dread Tower
and Siege Battery retain their existing artwork and renderer paths.

The Census revision removes the detached archive blocks and screen kiosk. Its
low crescent gallery forms a continuous civic building around the index tower.
The Titanium Levy is a mobilisation facility: activation spends half the stored
manpower on an army at the monument and freezes regeneration for two hours
(current values verified in shared constants and the simulation command handler).
Its enclosed assembly hall and deployment court express this existing function.

The Sovereign Siege Engine uses `client-monuments/monument-siege.ts`: a large
elevated accelerator barrel on a traversing armoured mount, with an open bore,
containment collars, recoil pistons and a caged Fracture Core. Its silhouette
expresses the existing Worldbreaker role; strike rules and effects are unchanged.
