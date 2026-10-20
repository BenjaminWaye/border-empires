import type { Color } from "three";
import type { HillNeighborFlags, RoadCutDirections } from "../client-map-3d-hill-shape.js";
import type { OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";

// One remembered ("fogged") tile's footprint for the fog overlays in
// client-map-3d.ts (the slate wash and the last-known owner tint): flat
// tiles get one quad between their corners, hill tiles drape over the dome.
export type FoggedOverlayTile = {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  /** Corner heights (ground + overlay rise, no hill bonus) at (x0,z0), (x1,z0), (x0,z1), (x1,z1). */
  readonly corner00Y: number;
  readonly corner10Y: number;
  readonly corner01Y: number;
  readonly corner11Y: number;
  readonly isHill: boolean;
  readonly hillNeighbors: HillNeighborFlags;
  readonly wx: number;
  readonly wy: number;
  readonly roadDirs: RoadCutDirections | undefined;
};

export const addFoggedOverlayTile = (overlay: OwnershipOverlay, tile: FoggedOverlayTile, color: Color): void => {
  const { x0, x1, z0, z1, corner00Y, corner10Y, corner01Y, corner11Y } = tile;
  if (tile.isHill) {
    overlay.addHillTile(x0, x1, z0, z1, corner00Y, corner10Y, corner01Y, corner11Y, color, false, tile.hillNeighbors, tile.wx, tile.wy, tile.roadDirs);
  } else {
    overlay.addTile(x0, corner00Y, z0, x1, corner10Y, z0, x0, corner01Y, z1, x1, corner11Y, z1, color, false);
  }
};

/**
 * Whether a fogged tile's slate wash is left to the fogged mist
 * (client-map-3d-fogged-mist.ts), which cuts it at the fog's organic edge
 * just past your vision and draws it in one pass with the mist, so no seam
 * shows between tiles: flat land. Hills and mountains rise through the mist
 * sheet, so they keep their per-tile wash.
 */
export const foggedWashInMist = (terrain: string, isHill: boolean): boolean => terrain === "LAND" && !isHill;
