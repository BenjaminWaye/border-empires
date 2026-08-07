import { BufferAttribute, PlaneGeometry } from "three";
import { HEIGHTFIELD_SAND_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";

/**
 * Ground-glow/water effect planes for natural wonders span the wonder's own
 * tile plus its 8 neighbors (3x3, see docs/natural-wonders-design.md §3.4).
 * Real terrain elevation varies a lot across that span (grass ~0.18, sand
 * ~0.07, coastal sea ~-0.16, deep sea ~-0.36, +0.45 more on hills), so a
 * single flat plane either gets clipped by rising land poking through it or
 * hidden under/behind the water surface. This builds a 4x4-vertex (3x3-quad)
 * grid whose corners sample the real heightfield's own tile corners (the
 * same source client-map-3d-ownership-overlay.ts uses to drape its tint
 * over hills), so the effect hugs the terrain's actual contour: it clips
 * correctly against hills and anything built on a neighboring tile, and
 * sea/coastal-sea corners are lifted to just above the water surface instead
 * of the (much lower) sea floor, where they'd z-fight the opaque sea-floor
 * mesh and normally render invisible under the water surface plane.
 */
const GRID_CORNERS = 4; // 4 corners per axis = 3x3 quads, one per tile in the 3x3 span.
const CLEARANCE = 0.01;

export type TerrainCornerSampler = (cornerX: number, cornerZ: number) => number;

export const createContouredGroundGeometry = (): PlaneGeometry => {
  const geometry = new PlaneGeometry(3, 3, GRID_CORNERS - 1, GRID_CORNERS - 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

/** Re-samples a contoured ground geometry's heights for a wonder now known to sit at world tile (wx, wy). */
export const sampleContouredGroundHeights = (
  geometry: PlaneGeometry,
  wx: number,
  wy: number,
  cornerYAt: TerrainCornerSampler
): void => {
  const position = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    // Corner mapping is derived from the vertex's own local X/Z (rather than
    // assumed from PlaneGeometry's row/column iteration order) so it holds
    // regardless of how rotateX reassigned axes above.
    const cornerX = Math.round(wx + position.getX(i) + 0.5);
    const cornerZ = Math.round(wy + position.getZ(i) + 0.5);
    const rendered = cornerYAt(cornerX, cornerZ);
    const y = (rendered < HEIGHTFIELD_SAND_ELEVATION ? WATER_SURFACE_Y : rendered) + CLEARANCE;
    position.setY(i, y);
  }
  position.needsUpdate = true;
};
