// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit.
//
// v1-v4: every lake was a plain circle (see the legacy branch below) --
// same 52-tile grid, same existence roll, but zero shape variety. v5 picks
// one of three shape kinds per candidate (round, elongated, wandering) so
// lakes actually read as distinct places instead of one repeated stamp.
// Legacy behavior is kept byte-for-byte under worldgenVersion < 5 so
// already-running seasons don't have their coastline silently redrawn.
//
// Unlike the legacy version, candidates are searched across the 3x3
// neighborhood of grid cells around (x, y) (the same pattern as
// isHighlandsClusterAt/meadowRingAt) so a shape doesn't get clipped at its
// own cell's boundary -- the elongated/wandering shapes can be wider than
// the 52-tile cell.
import { seeded01 } from "./worldgen-noise.js";

const LAKE_CELL = 52;
const LAKE_CHANCE = 0.89; // legacy threshold: seeded01(...) > this rolls a lake

const legacyIsLakeAt = (x: number, y: number, seed: number): boolean => {
  const gx = Math.floor(x / LAKE_CELL);
  const gy = Math.floor(y / LAKE_CELL);
  if (seeded01(gx, gy, seed + 71) <= LAKE_CHANCE) return false;
  const cx = gx * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 72) * LAKE_CELL);
  const cy = gy * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 73) * LAKE_CELL);
  const r = 2 + Math.floor(seeded01(gx, gy, seed + 74) * 6);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

type LakeShape = "ROUND" | "ELONGATED" | "WANDERING";

const lakeShapeFor = (gx: number, gy: number, seed: number): LakeShape => {
  const roll = seeded01(gx, gy, seed + 75);
  if (roll < 0.4) return "ROUND";
  if (roll < 0.75) return "ELONGATED";
  return "WANDERING";
};

const isInRoundLake = (dx: number, dy: number, gx: number, gy: number, seed: number): boolean => {
  const r = 3 + Math.floor(seeded01(gx, gy, seed + 74) * 7); // 3..9
  return dx * dx + dy * dy <= r * r;
};

const isInElongatedLake = (dx: number, dy: number, gx: number, gy: number, seed: number): boolean => {
  const angle = seeded01(gx, gy, seed + 76) * Math.PI;
  const semiMajor = 7 + seeded01(gx, gy, seed + 77) * 8; // 7..15
  const semiMinor = 2.5 + seeded01(gx, gy, seed + 78) * 3; // 2.5..5.5
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const rx = dx * ca + dy * sa;
  const ry = -dx * sa + dy * ca;
  return (rx * rx) / (semiMajor * semiMajor) + (ry * ry) / (semiMinor * semiMinor) <= 1;
};

// A short chain of overlapping circles walked in a jittered direction --
// reads as a bendy, organic lake rather than a stamped ellipse.
const isInWanderingLake = (x: number, y: number, cx: number, cy: number, gx: number, gy: number, seed: number): boolean => {
  let px = cx;
  let py = cy;
  let heading = seeded01(gx, gy, seed + 79) * Math.PI * 2;
  const steps = 3 + Math.floor(seeded01(gx, gy, seed + 80) * 2); // 3..4
  for (let i = 0; i < steps; i++) {
    const r = 2 + seeded01(gx, gy, seed + 81 + i * 3) * 3; // 2..5
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy <= r * r) return true;
    const stepLen = 5 + seeded01(gx, gy, seed + 82 + i * 3) * 4; // 5..9
    heading += (seeded01(gx, gy, seed + 83 + i * 3) - 0.5) * (Math.PI * 0.6); // wander +-54 deg
    px += Math.cos(heading) * stepLen;
    py += Math.sin(heading) * stepLen;
  }
  return false;
};

export const isLakeAt = (x: number, y: number, seed: number, version: number): boolean => {
  if (version < 5) return legacyIsLakeAt(x, y, seed);
  const gx0 = Math.floor(x / LAKE_CELL);
  const gy0 = Math.floor(y / LAKE_CELL);
  for (let dgy = -1; dgy <= 1; dgy++) {
    for (let dgx = -1; dgx <= 1; dgx++) {
      const gx = gx0 + dgx;
      const gy = gy0 + dgy;
      if (seeded01(gx, gy, seed + 71) <= LAKE_CHANCE) continue;
      const cx = gx * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 72) * LAKE_CELL);
      const cy = gy * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 73) * LAKE_CELL);
      const dx = x - cx;
      const dy = y - cy;
      const shape = lakeShapeFor(gx, gy, seed);
      if (shape === "ROUND" && isInRoundLake(dx, dy, gx, gy, seed)) return true;
      if (shape === "ELONGATED" && isInElongatedLake(dx, dy, gx, gy, seed)) return true;
      if (shape === "WANDERING" && isInWanderingLake(x, y, cx, cy, gx, gy, seed)) return true;
    }
  }
  return false;
};
