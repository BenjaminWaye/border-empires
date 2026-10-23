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
  // Map names inked on the ground (client-map-3d-name-decal): over the
  // ownership tint and rivers, under fog, mist, storm clouds and every
  // overlay; depth-tested so buildings and units stand in front.
  groundNames: 8.5,
  fogDarkenSettled: 9,
  fogDarkenFrontier: 10,
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
