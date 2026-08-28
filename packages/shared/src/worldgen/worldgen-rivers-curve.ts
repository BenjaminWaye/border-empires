// Small standalone math helpers for worldgen-rivers.ts's Catmull-Rom
// smoothing pass, split into their own file to keep worldgen-rivers.ts under
// the repo's 500-line cap.

/** Cubic Catmull-Rom interpolation between p1 and p2, using p0/p3 as tangent control points. */
export const catmullRom1D = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

// Same idea as client-map-3d-pointer-pick.ts's toroidDelta (not reused
// directly since that module is client-only): the shortest signed offset
// from `to` to `from` on a wrapped axis of size `dim`, so interpolation
// across a world edge sees a short real step instead of jumping most of the
// way across the map.
export const toroidDelta1D = (from: number, to: number, dim: number): number => {
  let delta = to - from;
  if (delta > dim / 2) delta -= dim;
  if (delta < -dim / 2) delta += dim;
  return delta;
};
