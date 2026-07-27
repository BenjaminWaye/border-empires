/**
 * Pure line-of-sight math for terrain-based vision occlusion. No caching or
 * map access here — see vision-footprint-table.ts for the memoized,
 * hot-path-safe wrapper that decides when this module actually needs to run.
 *
 * Two independent occluders, both terrain effects (not ownership effects —
 * an unowned mountain or forest occludes exactly the same as an owned one):
 *
 * - Mountains fully block vision *past* them: a ray from the source to a
 *   candidate tile is blocked if any tile strictly between the two endpoints
 *   is a mountain. The source tile and the candidate tile itself are never
 *   treated as blockers of themselves — a mountain tile is visible; tiles
 *   behind it are not (unless another unblocked ray reaches them, e.g.
 *   through a gap).
 * - Forests partially block vision: once a ray crosses a forest tile, it can
 *   continue only FOREST_VISION_RANGE tiles further before being cut off.
 *   The *source* tile's own forest-ness is deliberately excluded — standing
 *   in a forest doesn't blur your own local sight, only looking THROUGH
 *   forest terrain (yours, an enemy's, or unowned) to reach something
 *   farther away does.
 */

import { FOREST_VISION_RANGE } from "@border-empires/shared";

export type MountainAt = (x: number, y: number) => boolean;
export type ForestAt = (x: number, y: number) => boolean;

/**
 * Bresenham-style integer walk from (0,0) to (dx,dy), yielding intermediate
 * lattice points only (excluding both endpoints). Exported for testability
 * and as documentation of the ray-walk shape; `rayIsBlockedByMountain` walks
 * the same math inline (no allocation) rather than calling this.
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
 *
 * Walks the ray inline rather than via `intermediateRayPoints` — this and
 * `rayIsOccludedByForest` both run once per candidate offset for every
 * occluded tile+radius footprint computation (O(radius²) offsets, now a much
 * larger set of tiles than mountain-only since forest is common terrain), so
 * avoiding an array allocation per offset per occluder here measurably cuts
 * GC pressure on that one-time (memoized) computation.
 */
export const rayIsBlockedByMountain = (
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  mountainAt: MountainAt
): boolean => {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i < steps; i++) {
    const px = Math.round((dx * i) / steps);
    const py = Math.round((dy * i) / steps);
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
 * Lattice points along the ray from (0,0) to (dx,dy), INCLUDING the
 * candidate endpoint but EXCLUDING the source — the shape forest occlusion
 * needs (unlike mountains, it cares whether the candidate itself is the
 * first forest tile encountered, which must stay visible). Exported for
 * testability/documentation; `rayIsOccludedByForest` walks the same math
 * inline (no allocation) rather than calling this.
 */
export const pathPointsExcludingSource = (dx: number, dy: number): Array<[number, number]> => {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const points: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    points.push([Math.round((dx * i) / steps), Math.round((dy * i) / steps)]);
  }
  return points;
};

/**
 * Whether a ray from source (x0, y0) to offset (dx, dy) is occluded by
 * forest terrain: once the ray crosses a forest tile (the source tile
 * itself never counts as that first forest tile), it can continue only
 * FOREST_VISION_RANGE tiles further before being cut off. `forestAt`
 * receives world-wrapped coordinates. Walks the ray inline rather than via
 * `pathPointsExcludingSource` — see the perf note on `rayIsBlockedByMountain`.
 */
export const rayIsOccludedByForest = (x0: number, y0: number, dx: number, dy: number, forestAt: ForestAt): boolean => {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  let forestHitAtStep: number | undefined;
  for (let i = 1; i <= steps; i++) {
    const px = Math.round((dx * i) / steps);
    const py = Math.round((dy * i) / steps);
    if (forestHitAtStep === undefined && forestAt(x0 + px, y0 + py)) forestHitAtStep = i;
    if (forestHitAtStep !== undefined && i > forestHitAtStep + FOREST_VISION_RANGE) return true;
  }
  return false;
};

/**
 * LOS-filtered offsets visible from (x0, y0) at `radius`: every offset in
 * the square whose ray isn't blocked by an intermediate mountain and isn't
 * cut short by forest occlusion.
 */
export const computeLosOffsets = (
  x0: number,
  y0: number,
  radius: number,
  mountainAt: MountainAt,
  forestAt: ForestAt
): Array<[number, number]> =>
  squareOffsets(radius).filter(
    ([dx, dy]) => !rayIsBlockedByMountain(x0, y0, dx, dy, mountainAt) && !rayIsOccludedByForest(x0, y0, dx, dy, forestAt)
  );
