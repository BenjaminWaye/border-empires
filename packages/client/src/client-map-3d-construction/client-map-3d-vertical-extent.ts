import type { BufferGeometry } from "three";

// Vertical extent of a placed (rotated, scaled) box-bounded piece, shared by the
// construction gate in the structure piece builder and the Relay Beacon
// overlay (docs/construction-animation-plan.md). Row 1 of the composed
// column-major matrix (elements 1, 5, 9) already carries rotation and scale, so
// the world-space half-height is the sum of each local half-extent projected
// onto Y.
export type HalfExtents = { readonly halfX: number; readonly halfY: number; readonly halfZ: number };

export const geometryHalfExtents = (geometry: BufferGeometry): HalfExtents => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return box
    ? { halfX: (box.max.x - box.min.x) / 2, halfY: (box.max.y - box.min.y) / 2, halfZ: (box.max.z - box.min.z) / 2 }
    : { halfX: 0, halfY: 0, halfZ: 0 };
};

export const verticalHalfExtent = (matrixElements: ArrayLike<number>, extents: HalfExtents): number =>
  Math.abs(matrixElements[1]!) * extents.halfX + Math.abs(matrixElements[5]!) * extents.halfY + Math.abs(matrixElements[9]!) * extents.halfZ;
