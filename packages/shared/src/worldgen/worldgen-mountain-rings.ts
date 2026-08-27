// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit — same pattern as worldgen-hills.ts.
//
// isMountainCluster carves the ring-shaped mountain formations scattered
// across the map (an annulus: mountain between radius r-2 and r from a
// per-cell seeded center). Left as a bare annulus, a ring is a fully closed
// loop 360 degrees around — any land or lake inside it is completely sealed
// off from the surrounding terrain, which used to require the separate
// ensureLandMassesReachSea() connectivity pass to carve an emergency channel
// after the fact, and could still leave a placed dock stranded inside a
// mountain-locked pocket. This module always leaves a gap: a seeded wedge of
// the ring's angular span is excluded from the mountain, so the ring's
// interior is connected to its surroundings by construction, not by a
// later patch.
import { seeded01, worldSeed } from "./worldgen.js";

const TAU = Math.PI * 2;

// Width of the always-present opening in a mountain ring, in radians —
// randomized per ring between roughly 40 and 75 degrees so gaps read as a
// natural pass rather than a uniform notch.
const GAP_MIN_RADIANS = (40 * Math.PI) / 180;
const GAP_SPREAD_RADIANS = (35 * Math.PI) / 180;

const angleDelta = (a: number, b: number): number => {
  let delta = Math.abs(a - b) % TAU;
  if (delta > Math.PI) delta = TAU - delta;
  return delta;
};

export const isMountainCluster = (x: number, y: number): boolean => {
  const cell = 60;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const has = seeded01(gx, gy, worldSeed() + 601) > 0.52;
  if (!has) return false;
  const cx = gx * cell + Math.floor(seeded01(gx, gy, worldSeed() + 602) * cell);
  const cy = gy * cell + Math.floor(seeded01(gx, gy, worldSeed() + 603) * cell);
  const r = 3 + Math.floor(seeded01(gx, gy, worldSeed() + 604) * 5);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r || d2 < (r - 2) * (r - 2)) return false;

  // Never a fully closed loop: cut a seeded gap out of the ring's angular
  // span so the interior always has at least one opening to the outside.
  const gapCenter = seeded01(gx, gy, worldSeed() + 605) * TAU;
  const gapHalfWidth = (GAP_MIN_RADIANS + seeded01(gx, gy, worldSeed() + 606) * GAP_SPREAD_RADIANS) / 2;
  const angle = Math.atan2(dy, dx);
  if (angleDelta(angle, gapCenter) <= gapHalfWidth) return false;

  return true;
};
