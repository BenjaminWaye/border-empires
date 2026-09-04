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
const LEGACY_LAKE_CHANCE = 0.89; // legacy threshold: seeded01(...) > this rolls a lake
// v5 lakes were barely noticeable at the legacy rarity/size (a handful of
// 4-18 tile blobs across the whole map) -- raised so they read as an actual
// map feature instead of something you have to go looking for.
const LAKE_CHANCE = 0.72; // ~28% of cells roll a lake

const legacyIsLakeAt = (x: number, y: number, seed: number): boolean => {
  const gx = Math.floor(x / LAKE_CELL);
  const gy = Math.floor(y / LAKE_CELL);
  if (seeded01(gx, gy, seed + 71) <= LEGACY_LAKE_CHANCE) return false;
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

// Checks a handful of points on the shape's own perimeter (not just its
// center) against isInland -- a big round/elongated lake can still poke
// into the coast even when its center reads as solidly inland.
const isInRoundLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  const r = 5 + Math.floor(seeded01(gx, gy, seed + 74) * 10); // 5..14
  if (!isInland(cx + r, cy) || !isInland(cx - r, cy) || !isInland(cx, cy + r) || !isInland(cx, cy - r)) return false;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

const isInElongatedLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isInland: (px: number, py: number) => boolean
): boolean => {
  const angle = seeded01(gx, gy, seed + 76) * Math.PI;
  const semiMajor = 11 + seeded01(gx, gy, seed + 77) * 12; // 11..23
  const semiMinor = 4 + seeded01(gx, gy, seed + 78) * 5; // 4..9
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const majorEndA = [cx + ca * semiMajor, cy + sa * semiMajor] as const;
  const majorEndB = [cx - ca * semiMajor, cy - sa * semiMajor] as const;
  const minorEndA = [cx - sa * semiMinor, cy + ca * semiMinor] as const;
  const minorEndB = [cx + sa * semiMinor, cy - ca * semiMinor] as const;
  if (
    !isInland(...majorEndA) ||
    !isInland(...majorEndB) ||
    !isInland(...minorEndA) ||
    !isInland(...minorEndB)
  ) {
    return false;
  }
  const dx = x - cx;
  const dy = y - cy;
  const rx = dx * ca + dy * sa;
  const ry = -dx * sa + dy * ca;
  return (rx * rx) / (semiMajor * semiMajor) + (ry * ry) / (semiMinor * semiMinor) <= 1;
};

// A short chain of overlapping circles walked in a jittered direction --
// reads as a bendy, organic lake rather than a stamped ellipse. Each step's
// center must itself pass the inland check (via isStepInland) or the walk
// stops there, so the chain can't wander out to the coast even though its
// direction is randomized.
const isInWanderingLake = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  gx: number,
  gy: number,
  seed: number,
  isStepInland: (px: number, py: number) => boolean
): boolean => {
  let px = cx;
  let py = cy;
  let heading = seeded01(gx, gy, seed + 79) * Math.PI * 2;
  const steps = 4 + Math.floor(seeded01(gx, gy, seed + 80) * 2); // 4..5
  for (let i = 0; i < steps; i++) {
    if (!isStepInland(px, py)) return false;
    const r = 3 + seeded01(gx, gy, seed + 81 + i * 3) * 4; // 3..7
    const dx = x - px;
    const dy = y - py;
    if (dx * dx + dy * dy <= r * r) return true;
    const stepLen = 7 + seeded01(gx, gy, seed + 82 + i * 3) * 5; // 7..12
    heading += (seeded01(gx, gy, seed + 83 + i * 3) - 0.5) * (Math.PI * 0.6); // wander +-54 deg
    px += Math.cos(heading) * stepLen;
    py += Math.sin(heading) * stepLen;
  }
  return false;
};

// A lake candidate never spawns unless its center reads as solidly inland
// (well above the sea/coastal noise threshold baseTerrainCodeAt itself uses)
// -- otherwise the shape just extends the coastline into a bay/inlet that
// merges with the open ocean instead of reading as a separate lake.
const INLAND_SAFE_CONTINENT_FIELD = 0.22;

export const isLakeAt = (
  x: number,
  y: number,
  seed: number,
  version: number,
  continentFieldAt: (x: number, y: number) => number
): boolean => {
  if (version < 5) return legacyIsLakeAt(x, y, seed);
  const gx0 = Math.floor(x / LAKE_CELL);
  const gy0 = Math.floor(y / LAKE_CELL);
  const isInland = (px: number, py: number): boolean => continentFieldAt(px, py) >= INLAND_SAFE_CONTINENT_FIELD;
  for (let dgy = -1; dgy <= 1; dgy++) {
    for (let dgx = -1; dgx <= 1; dgx++) {
      const gx = gx0 + dgx;
      const gy = gy0 + dgy;
      if (seeded01(gx, gy, seed + 71) <= LAKE_CHANCE) continue;
      const cx = gx * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 72) * LAKE_CELL);
      const cy = gy * LAKE_CELL + Math.floor(seeded01(gx, gy, seed + 73) * LAKE_CELL);
      if (!isInland(cx, cy)) continue;
      const shape = lakeShapeFor(gx, gy, seed);
      if (shape === "ROUND" && isInRoundLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
      if (shape === "ELONGATED" && isInElongatedLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
      if (shape === "WANDERING" && isInWanderingLake(x, y, cx, cy, gx, gy, seed, isInland)) return true;
    }
  }
  return false;
};
