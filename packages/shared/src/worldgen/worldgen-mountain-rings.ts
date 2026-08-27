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
const RING_CELL = 60;

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

export type MountainRingParams = {
  gx: number;
  gy: number;
  cx: number;
  cy: number;
  /** Outer radius of the mountain annulus. */
  outerRadius: number;
  /** Inner radius of the mountain annulus — the interior is d < innerRadius. */
  innerRadius: number;
  gapCenter: number;
  gapHalfWidth: number;
};

// Seeded ring parameters for the 60x60 grid cell containing (gx, gy) —
// undefined when this cell has no ring at all. Shared by isMountainCluster
// (per-tile annulus test) and enumerateMountainRingInteriors (per-ring
// interior enumeration for placement) so both agree on the exact same rings.
export const mountainRingAtCell = (gx: number, gy: number): MountainRingParams | undefined => {
  const has = seeded01(gx, gy, worldSeed() + 601) > 0.52;
  if (!has) return undefined;
  const cx = gx * RING_CELL + Math.floor(seeded01(gx, gy, worldSeed() + 602) * RING_CELL);
  const cy = gy * RING_CELL + Math.floor(seeded01(gx, gy, worldSeed() + 603) * RING_CELL);
  const outerRadius = 3 + Math.floor(seeded01(gx, gy, worldSeed() + 604) * 5);
  const gapCenter = seeded01(gx, gy, worldSeed() + 605) * TAU;
  const gapHalfWidth = (GAP_MIN_RADIANS + seeded01(gx, gy, worldSeed() + 606) * GAP_SPREAD_RADIANS) / 2;
  return { gx, gy, cx, cy, outerRadius, innerRadius: outerRadius - 2, gapCenter, gapHalfWidth };
};

export const isMountainCluster = (x: number, y: number): boolean => {
  const gx = Math.floor(x / RING_CELL);
  const gy = Math.floor(y / RING_CELL);
  const ring = mountainRingAtCell(gx, gy);
  if (!ring) return false;
  const dx = x - ring.cx;
  const dy = y - ring.cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > ring.outerRadius * ring.outerRadius || d2 < ring.innerRadius * ring.innerRadius) return false;

  // Never a fully closed loop: cut a seeded gap out of the ring's angular
  // span so the interior always has at least one opening to the outside.
  const angle = Math.atan2(dy, dx);
  if (angleDelta(angle, ring.gapCenter) <= ring.gapHalfWidth) return false;

  return true;
};

// Every ring on the map (one candidate per 60x60 grid cell, same seeding as
// isMountainCluster's `has` check), used by the dedicated ring-interior
// placement pass in season-seed-world.ts. Grid cells span the whole map:
// callers pass the world's tile dimensions so wraparound cells are included.
export const enumerateMountainRings = (worldWidth: number, worldHeight: number): MountainRingParams[] => {
  const gridCols = Math.ceil(worldWidth / RING_CELL);
  const gridRows = Math.ceil(worldHeight / RING_CELL);
  const rings: MountainRingParams[] = [];
  for (let gy = 0; gy < gridRows; gy += 1) {
    for (let gx = 0; gx < gridCols; gx += 1) {
      const ring = mountainRingAtCell(gx, gy);
      if (ring) rings.push(ring);
    }
  }
  return rings;
};
