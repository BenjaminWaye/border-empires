// Plate geometry and boundary physics shared by the score field
// (worldgen-continent-score.ts) and the v10 shelf/rift model
// (worldgen-continent-shelf.ts): per-plate distorted distances, the
// nearest-plate search, and how a pair of plates' drift turns into stress and
// uplift at their boundary. Split out of worldgen-continent-score.ts (500-line
// cap) so both modules can share it without importing each other.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { valueNoise } from "./worldgen-noise.js";
import type { Plate } from "./worldgen-plates.js";

const toroidalDx = (a: number, b: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, WORLD_WIDTH - d);
};

// Distorts a tile's distance to ONE plate by noise unique to that plate (its
// own seed offset), not a shared global warp -- this is the actual technique
// LeatherBee's "Terrain Generation 4" describes as "noised faultlines":
// perturbing the fault/boundary itself, not just globally translating the
// sample point before a clean distance calculation. A shared coordinate warp
// (see warpedCoords) moves whole regions together and still leaves the
// underlying Voronoi partition mathematically clean/geometric; distorting
// each plate's own pull independently is what actually breaks the boundary
// into a fractal, organic line instead of a warped-but-still-smooth curve.
const plateDistortionSeed = (plate: Plate): number => Math.floor(plate.cx * 7919 + plate.cy * 104729);
export const distortedDistanceTo = (wx: number, wy: number, plate: Plate, rawDist: number): number => {
  const macro = valueNoise(wx, wy, 70, plateDistortionSeed(plate) + 11);
  const factor = 1 + (macro - 0.5) * 1.1;
  return rawDist * Math.max(0.25, factor);
};

// |gradient| per tile of (distance to far - distance to near) for one plate
// pair, by central differences. Only the rift path needs it (see
// worldgen-continent-shelf.ts), so it costs 8 distance evaluations on rift
// tiles alone rather than a full nearestPlates search.
const pairDistanceDiff = (px: number, py: number, near: Plate, far: Plate): number =>
  distortedDistanceTo(px, py, far, Math.hypot(toroidalDx(px, far.cx), py - far.cy)) -
  distortedDistanceTo(px, py, near, Math.hypot(toroidalDx(px, near.cx), py - near.cy));
export const pairDiffGradientAt = (wx: number, wy: number, near: Plate, far: Plate): number => {
  const gx = (pairDistanceDiff(wx + 1, wy, near, far) - pairDistanceDiff(wx - 1, wy, near, far)) / 2;
  const gy = (pairDistanceDiff(wx, wy + 1, near, far) - pairDistanceDiff(wx, wy - 1, near, far)) / 2;
  return Math.hypot(gx, gy);
};

// Every plate's distorted distance from (wx, wy) written into `out`, plus the
// indices of the nearest two -- toroidal-aware in x (matches buildPlates'
// toroidal spacing check) but not in y, since the map's poles (POLAR_BAND
// rows) are real edges, not a wraparound seam. v10 needs more than the two
// nearest (the nearest oceanic plate and the nearest other continent), so
// callers get all distances from the one pass instead of searching again.
export const plateDistances = (
  wx: number, wy: number, plates: Plate[], out: Float64Array
): { nearIdx: number; farIdx: number } => {
  let nearIdx = 0;
  let nearDist = Infinity;
  let farIdx = 0;
  let farDist = Infinity;
  for (let i = 0; i < plates.length; i += 1) {
    const p = plates[i]!;
    const dist = distortedDistanceTo(wx, wy, p, Math.hypot(toroidalDx(wx, p.cx), wy - p.cy));
    out[i] = dist;
    if (dist < nearDist) {
      farDist = nearDist;
      farIdx = nearIdx;
      nearDist = dist;
      nearIdx = i;
    } else if (dist < farDist) {
      farDist = dist;
      farIdx = i;
    }
  }
  return { nearIdx, farIdx };
};

let scratchDistances = new Float64Array(0);
export const nearestPlates = (wx: number, wy: number, plates: Plate[]): { near: Plate; nearDist: number; far: Plate; farDist: number } => {
  if (scratchDistances.length < plates.length) scratchDistances = new Float64Array(plates.length);
  const { nearIdx, farIdx } = plateDistances(wx, wy, plates, scratchDistances);
  return { near: plates[nearIdx]!, nearDist: scratchDistances[nearIdx]!, far: plates[farIdx]!, farDist: scratchDistances[farIdx]! };
};

// How far into a convergent/divergent boundary's influence zone (wx, wy)
// sits: ~1 right at the boundary (near and far plate equidistant), decaying
// to 0 deep inside a single plate's territory. The Red Blob Games trick for
// deriving boundary proximity from a Voronoi diagram without ever building
// its actual polygon edges. Narrow: at 0.09 this bled uplift/mountains 30-40+
// tiles deep into every plate's territory, chewing huge gray blobs out of
// every landmass instead of a clean range tracing the boundary.
export const BOUNDARY_BLEND_WIDTH = Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.02;
export const boundaryStrengthOf = (nearDist: number, farDist: number): number =>
  Math.max(0, 1 - (farDist - nearDist) / BOUNDARY_BLEND_WIDTH);

// Positive = convergent (plates closing the gap between their centers along
// the line joining them -- colliding), negative = divergent (separating).
export const convergentStressOf = (near: Plate, far: Plate): number => {
  const dx = toroidalDx(far.cx, near.cx) * (far.cx >= near.cx ? 1 : -1);
  const dy = far.cy - near.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const nearVx = Math.cos(near.driftAngle) * near.driftSpeed;
  const nearVy = Math.sin(near.driftAngle) * near.driftSpeed;
  const farVx = Math.cos(far.driftAngle) * far.driftSpeed;
  const farVy = Math.sin(far.driftAngle) * far.driftSpeed;
  const relVx = nearVx - farVx;
  const relVy = nearVy - farVy;
  return -(relVx * nx + relVy * ny);
};

// How much a given (nearPlate type, farPlate type, stress sign) combination
// raises or lowers elevation at the boundary. Continental-continental
// collisions produce the tallest ranges (real orogeny, e.g. the Himalayas);
// continental-oceanic collisions uplift the continental side into a coastal
// range (Andes-style) while deepening a trench on the oceanic side;
// oceanic-oceanic collisions form milder island-arc uplift. Divergent
// boundaries only get a subtle depression -- rift valleys/mid-ocean ridges
// are real but not the focus here, so they shouldn't just read as more
// ordinary coastline.
// Oceanic-oceanic convergence returns 0, not a mild positive island-arc
// bump: with the narrow boundary blend width needed to keep mountain ranges
// thin (see BOUNDARY_BLEND_WIDTH), even a small uplift there was enough to
// push a THIN THREAD of open ocean above the land threshold exactly along
// the boundary -- since Voronoi boundaries meet in a branching graph, this
// showed up as bizarre root/lightning-bolt-shaped slivers of land isolated
// in open water, connected to no real continent. Real volcanic island arcs
// exist, but aren't worth the risk of reintroducing that artifact here.
export const upliftMultiplierFor = (nearContinental: boolean, farContinental: boolean, stress: number): number => {
  if (stress >= 0) {
    if (nearContinental && farContinental) return 1.5;
    if (nearContinental) return 0.9;
    if (farContinental) return -0.6;
    return 0;
  }
  return nearContinental && farContinental ? -0.3 : -0.15;
};
export const UPLIFT_SCALE = 0.9;
// The continental side's multiplier from upliftMultiplierFor (continental near, oceanic far).
export const CONTINENTAL_MARGIN_UPLIFT = 0.9;
