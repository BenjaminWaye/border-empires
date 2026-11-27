// Named renderOrder slots for the surface overlays whose relative order is a
// design rule rather than an accident. Three.js sorts transparent meshes by
// renderOrder first, so these decide what paints over what on a tile.
//
// River water sits above the ownership fill (territory tint stops at the
// waterline; docs/rivers-remake-plan.md decision 4) but below the fog-darken
// layers, so fog darkens a river like the ground around it. Selection,
// hover and markers stay far above all of them.
export const RENDER_ORDER = {
  ownershipSettled: 6,
  ownershipFrontier: 7,
  // Wet river bank over the ownership fill, under the water (river-bank-strip).
  riverBank: 7.5,
  riverWater: 8,
  // Ground ore flecks and crystal clues stay readable over the owner tint.
  prospectClues: 8.25,
  // Insurgent frontier insignia stamped on the ground (client-map-3d-insurgent-insignia-overlay.ts):
  // over the owner tint, under both fog layers so remembered Insurgent land darkens with the rest.
  insurgentInsignia: 8.3,
  fogDarkenSettled: 9,
  fogDarkenFrontier: 10,
  // Map names inked on the ground (client-map-3d-name-decal): over the
  // ownership tint, rivers and both fog layers (the 0.55 slate wash used to
  // wash names out on remembered land; the 2D map already draws names over
  // fog); under the drifting mist, ocean, storm clouds and every overlay;
  // depth-tested so buildings and units stand in front.
  // A focused House Charge's shaded area and its gold outline (client-map-3d-map-guide-overlay.ts): explored
  // tiles only, so over the ownership fill and both fog layers (as the 2D overlay draws it) but under the inked
  // names, the drifting mist and the storm.
  houseChargeAreaTint: 10.2,
  houseChargeAreaOutline: 10.3,
  groundNames: 10.5,
  // client-map-3d-water-surface.ts: the ocean plane.
  oceanSurface: 12,
  // Soft foam band along every coastline, on the sea (client-map-3d-shore.ts).
  shoreFoam: 12.5,
  // Drifting mist over remembered (fogged) tiles, level with the land: over
  // the water and fog-darken layers it hazes, under the river mouth and every
  // overlay drawn from 13 up, e.g. placement previews (client-map-3d-fogged-mist.ts).
  foggedMist: 12.75,
  // A river's mouth plume spills out over the sea, so it draws after it.
  riverMouth: 13,
  // Unexplored storm clouds, level with the land: over all ground-level
  // surfaces at the fog border (client-map-3d-unexplored-storm.ts).
  unexploredStorm: 14,
  // Guide rings (client-map-3d-onboarding-checklist-highlight.ts): halo, ring,
  // then arrowheads. Over the storm and the fogged mist, since the guide points
  // at unexplored ground (Explore) and at towns a scout drone found that have
  // gone back under fog; under the placement-preview and crystal-targeting
  // markers (15, client-map-3d-placement-overlay.ts / crystal-targeting overlay)
  // and the selection and hover markers.
  // A focused House Charge's dotted rough circles and link (client-map-3d-map-guide-overlay.ts): over the
  // storm and fogged mist, since they mark unexplored ground; drawn at 2 the storm hid them (owner, 2026-11-19).
  houseChargeGuideDots: 14.15,
  guideMarkerHalo: 14.2,
  guideMarkerRing: 14.3,
  guideMarkerChevron: 14.4,
  // client-map-3d.ts: selectedMarker / hoverMarker.
  selectedMarker: 30,
  hoverMarker: 31
} as const;

export type OverlayRenderOrders = { readonly settled: number; readonly frontier: number };

/** Render orders for the two fog overlays (slate wash, normal blend + last-known owner tint, multiply blend). */
export const FOG_OVERLAY_RENDER_ORDERS: OverlayRenderOrders = {
  settled: RENDER_ORDER.fogDarkenSettled,
  frontier: RENDER_ORDER.fogDarkenFrontier
};
