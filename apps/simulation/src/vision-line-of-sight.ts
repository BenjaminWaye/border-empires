/**
 * Pure line-of-sight math for terrain-based vision occlusion (mountains) and
 * terrain-based vision clamping (forests). No caching or map access here —
 * see vision-footprint-table.ts for the memoized, hot-path-safe wrapper that
 * decides when this module actually needs to run.
 *
 * Mountains block vision *past* them: a ray from the source to a candidate
 * tile is blocked if any tile strictly between the two endpoints is a
 * mountain. The source tile and the candidate tile itself are never treated
 * as blockers of themselves — a mountain tile is visible; tiles behind it
 * are not (unless another unblocked ray reaches them, e.g. through a gap).
 */

export type MountainAt = (x: number, y: number) => boolean;

/**
 * Bresenham-style integer walk from (0,0) to (dx,dy), yielding intermediate
 * lattice points only (excluding both endpoints). Used to sample the terrain
 * a ray from a vision source to a candidate offset actually crosses.
 */
export const intermediateRayPoints = (dx: number, dy: number): Array<[number, number]> => {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const points: Array<[number, number]> = [];
  for (let i = 1; i < steps; i++) {
    const px = Math.round((dx * i) / steps);
    const py = Math.round((dy * i) / steps);
    points.push([px, py]);
  }
  return points;
};

/**
 * Whether a ray from source tile (x0, y0) to offset (dx, dy) is blocked by a
 * mountain lying strictly between the two endpoints. `mountainAt` receives
 * world-wrapped coordinates and should consult the live (mutable) tile
 * terrain, not static worldgen — CREATE_MOUNTAIN/REMOVE_MOUNTAIN mutate a
 * tile's terrain in place.
 */
export const rayIsBlockedByMountain = (
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  mountainAt: MountainAt
): boolean => {
  for (const [px, py] of intermediateRayPoints(dx, dy)) {
    if (mountainAt(x0 + px, y0 + py)) return true;
  }
  return false;
};

/**
 * All (dx, dy) offsets within a Chebyshev square of `radius` around the
 * origin, in a fixed deterministic order. Shared by the plain (unoccluded)
 * footprint and as the candidate set for LOS-filtered footprints.
 */
export const squareOffsets = (radius: number): Array<[number, number]> => {
  const offsets: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      offsets.push([dx, dy]);
    }
  }
  return offsets;
};

/**
 * LOS-filtered offsets visible from (x0, y0) at `radius`: every offset in
 * the square whose ray isn't blocked by an intermediate mountain.
 */
export const computeLosOffsets = (
  x0: number,
  y0: number,
  radius: number,
  mountainAt: MountainAt
): Array<[number, number]> => squareOffsets(radius).filter(([dx, dy]) => !rayIsBlockedByMountain(x0, y0, dx, dy, mountainAt));
