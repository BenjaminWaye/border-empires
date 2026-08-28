// Pure river-path generation, extracted from
// packages/client/src/client-map-3d-rivers/client-map-3d-rivers.ts so it has
// zero Three.js dependency and can be reused by non-rendering consumers (the
// worldgen-lab dev tool's 2D top-down view). This module only produces the
// deterministic per-seed polylines (multi-source BFS distance-to-coast field,
// then a walk from a near-mountain start strictly toward the coast with a
// noise wobble, then Catmull-Rom smoothing) — it reads worldgen state
// (terrainAt/landBiomeAt/seeded01/getWorldSeed) and never mutates anything.
// All Three.js mesh-building/material/scene-lifecycle code stays in
// client-map-3d-rivers.ts, which now imports path generation from here.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { getWorldSeed, seeded01, terrainAt } from "./worldgen.js";
import { catmullRom1D, toroidDelta1D } from "./worldgen-rivers-curve.js";

const RIVER_COUNT_TARGET = 10;
const RIVER_START_ATTEMPTS = 60;
const START_SCAN_ATTEMPTS_PER_RIVER = 500;
const MAX_RIVER_STEPS = 400;
const MIN_RIVER_POINTS = 5;
const NEAR_MOUNTAIN_RADIUS = 2;
const WOBBLE_AMOUNT = 0.55;
// Rivers taper from a narrow source to a wide mouth instead of a constant
// width the whole way, using how far each raw point has walked from its
// start (in BFS tiles) toward the sea as a stand-in for accumulated flow —
// this module has no real tributary/discharge model, just the single walked
// path, so "flow so far along this one path" is the only signal available.
const RIVER_MIN_HALF_WIDTH = 0.07;
const RIVER_MAX_HALF_WIDTH = 0.24;
// Straight-line segments between the raw walked (wobbled) points produced a
// visibly faceted ribbon at close zoom — every wobble step showed up as a
// hard kink. Catmull-Rom resampling fits a smooth curve through the same
// points and re-samples it at higher density, which is the standard fix for
// this look.
const CURVE_SAMPLES_PER_SEGMENT = 4;

export type RiverPoint = { readonly wx: number; readonly wy: number; readonly halfWidth: number };
export type RiverPath = readonly RiverPoint[];

// Multi-source BFS from every SEA/COASTAL_SEA tile, 4-directional with
// toroidal wrap. Guarantees a strictly-decreasing path exists from any land
// tile to the coast, which is what makes walkRiver below terminate without
// ever needing to discard a river for getting stuck.
const buildDistanceToSea = (): Uint16Array => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const dist = new Uint16Array(total).fill(0xffff);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const idx = (x: number, y: number): number => y * WORLD_WIDTH + x;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const t = terrainAt(x, y);
      if (t === "SEA" || t === "COASTAL_SEA") {
        dist[idx(x, y)] = 0;
        queue[tail] = idx(x, y);
        tail += 1;
      }
    }
  }
  while (head < tail) {
    const i = queue[head]!;
    head += 1;
    const cx = i % WORLD_WIDTH;
    const cy = Math.floor(i / WORLD_WIDTH);
    const d = dist[i]! + 1;
    const neighbors: ReadonlyArray<readonly [number, number]> = [
      [wrapX(cx + 1, WORLD_WIDTH), cy],
      [wrapX(cx - 1, WORLD_WIDTH), cy],
      [cx, wrapY(cy + 1, WORLD_HEIGHT)],
      [cx, wrapY(cy - 1, WORLD_HEIGHT)]
    ];
    for (const [nx, ny] of neighbors) {
      const ni = idx(nx, ny);
      if (dist[ni]! > d) {
        dist[ni] = d;
        queue[tail] = ni;
        tail += 1;
      }
    }
  }
  return dist;
};

const isNearMountain = (x: number, y: number): boolean => {
  for (let dy = -NEAR_MOUNTAIN_RADIUS; dy <= NEAR_MOUNTAIN_RADIUS; dy += 1) {
    for (let dx = -NEAR_MOUNTAIN_RADIUS; dx <= NEAR_MOUNTAIN_RADIUS; dx += 1) {
      if (terrainAt(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)) === "MOUNTAIN") return true;
    }
  }
  return false;
};

// Most mountains on a given world turn out to sit fairly close to the coast
// (land bands here rarely run more than ~40-50 tiles deep anywhere), so
// returning the *first* near-mountain land tile found produced mostly short
// stub rivers a handful of tiles long — technically valid but visually
// unsatisfying, and prone to looking like disconnected scribbles when two
// such stubs happen to land in the same view. Scanning further and keeping
// the farthest-from-coast candidate biases toward rivers that actually
// traverse a meaningful stretch of land, while the early-exit once "far
// enough" is reached keeps the scan cheap in the common case.
const MIN_RIVER_START_DISTANCE_TO_SEA = 12;

const findRiverStart = (
  distToSea: Uint16Array,
  seed: number,
  riverIndex: number
): { x: number; y: number } | undefined => {
  let best: { x: number; y: number } | undefined;
  let bestDistance = -1;
  for (let attempt = 0; attempt < START_SCAN_ATTEMPTS_PER_RIVER; attempt += 1) {
    const hx = Math.floor(seeded01(riverIndex * 97 + attempt, 11, seed + 6301) * WORLD_WIDTH);
    const hy = Math.floor(seeded01(riverIndex * 131 + attempt, 23, seed + 6317) * WORLD_HEIGHT);
    if (terrainAt(hx, hy) !== "LAND") continue;
    if (!isNearMountain(hx, hy)) continue;
    const distance = distToSea[hy * WORLD_WIDTH + hx]!;
    if (distance > bestDistance) {
      bestDistance = distance;
      best = { x: hx, y: hy };
      if (bestDistance >= MIN_RIVER_START_DISTANCE_TO_SEA) break;
    }
  }
  return best;
};

// Walks strictly toward the coast using the precomputed distance field, with
// a noise tie-break among equally-good neighbours so the path meanders
// instead of taking the shortest possible staircase. BFS distance always
// has a strictly-decreasing 4-dir neighbour to follow, so this terminates
// well inside MAX_RIVER_STEPS in practice; the cap is defensive only.
const walkRiver = (
  start: { x: number; y: number },
  distToSea: Uint16Array,
  seed: number,
  riverIndex: number
): RiverPath | undefined => {
  const idx = (x: number, y: number): number => y * WORLD_WIDTH + x;
  const points: RiverPoint[] = [];
  let cx = start.x;
  let cy = start.y;
  let prevX = -1;
  let prevY = -1;
  // BFS distance-to-sea at the source is the total ground this path has to
  // cover; how much of that a given point has already covered stands in for
  // accumulated flow, since nothing upstream ever merges into this walk.
  const startD = distToSea[idx(cx, cy)]!;
  for (let step = 0; step < MAX_RIVER_STEPS; step += 1) {
    const wobbleX = (seeded01(cx * 13 + riverIndex * 7, cy * 17 + step, seed + 6401) - 0.5) * WOBBLE_AMOUNT;
    const wobbleY = (seeded01(cx * 19 + riverIndex * 11, cy * 23 + step, seed + 6413) - 0.5) * WOBBLE_AMOUNT;
    const d = distToSea[idx(cx, cy)]!;
    const flowFraction = startD > 0 ? Math.min(1, Math.max(0, (startD - d) / startD)) : 1;
    const halfWidth = RIVER_MIN_HALF_WIDTH + (RIVER_MAX_HALF_WIDTH - RIVER_MIN_HALF_WIDTH) * flowFraction;
    points.push({ wx: cx + 0.5 + wobbleX, wy: cy + 0.5 + wobbleY, halfWidth });
    // Stopping at d<=1 (the last *land* tile, adjacent to the coast) left
    // the ribbon's flat, untapered end short of the water by however much
    // of that final tile the wobble didn't cover — reading as the river
    // stopping just before the sea rather than flowing into it. Taking one
    // more step so the path's last point actually sits on the SEA/
    // COASTAL_SEA tile itself (d=0) guarantees it overlaps the water there
    // instead of leaving a gap.
    if (d <= 0) break;
    let bestX = cx;
    let bestY = cy;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrapX(cx + dx, WORLD_WIDTH);
        const ny = wrapY(cy + dy, WORLD_HEIGHT);
        if (nx === prevX && ny === prevY) continue;
        const nd = distToSea[idx(nx, ny)]!;
        if (nd > d) continue;
        const tie = seeded01(nx * 29 + riverIndex * 3, ny * 31 + step, seed + 6427);
        const score = nd * 10 + tie;
        if (score < bestScore) {
          bestScore = score;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    if (bestX === cx && bestY === cy) return undefined;
    prevX = cx;
    prevY = cy;
    cx = bestX;
    cy = bestY;
  }
  return points.length >= MIN_RIVER_POINTS ? points : undefined;
};

// Fits a Catmull-Rom curve through the raw walked points and re-samples it at
// CURVE_SAMPLES_PER_SEGMENT points per original segment, replacing the
// straight-line-between-wobbled-points look with a smooth meander. Endpoints
// clamp their missing neighbour to themselves (standard Catmull-Rom
// treatment) so the curve still starts/ends exactly on the source and mouth.
export const smoothRiverPath = (path: RiverPath): RiverPath => {
  if (path.length < 3) return path;
  const at = (i: number): RiverPoint => path[Math.min(Math.max(i, 0), path.length - 1)]!;
  const smoothed: RiverPoint[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // walkRiver's neighbour steps wrap toroidally, so a path that reaches a
    // world edge can jump from e.g. x=449.5 straight to x=0.5. Interpolating
    // those raw coordinates directly would make the curve extrapolate across
    // the whole map instead of the one real tile step it represents.
    // toroidDelta1D expresses every control point as a short offset from p1
    // (the segment's start) so the fit only ever sees the true, short
    // distance between neighbours; wrap folds the sampled result back into
    // world range afterward.
    const p0dx = toroidDelta1D(p1.wx, p0.wx, WORLD_WIDTH);
    const p0dy = toroidDelta1D(p1.wy, p0.wy, WORLD_HEIGHT);
    const p2dx = toroidDelta1D(p1.wx, p2.wx, WORLD_WIDTH);
    const p2dy = toroidDelta1D(p1.wy, p2.wy, WORLD_HEIGHT);
    const p3dx = toroidDelta1D(p1.wx, p3.wx, WORLD_WIDTH);
    const p3dy = toroidDelta1D(p1.wy, p3.wy, WORLD_HEIGHT);
    for (let s = 0; s < CURVE_SAMPLES_PER_SEGMENT; s += 1) {
      const t = s / CURVE_SAMPLES_PER_SEGMENT;
      smoothed.push({
        wx: wrapX(p1.wx + catmullRom1D(p0dx, 0, p2dx, p3dx, t), WORLD_WIDTH),
        wy: wrapY(p1.wy + catmullRom1D(p0dy, 0, p2dy, p3dy, t), WORLD_HEIGHT),
        // Width tapers monotonically with flow already; linear interpolation
        // (rather than another Catmull-Rom pass) is enough to avoid a
        // stepped width change at each original sample point.
        halfWidth: p1.halfWidth + (p2.halfWidth - p1.halfWidth) * t
      });
    }
  }
  smoothed.push(path[path.length - 1]!);
  return smoothed;
};

const buildRivers = (seed: number): readonly RiverPath[] => {
  const distToSea = buildDistanceToSea();
  const rivers: RiverPath[] = [];
  for (let i = 0; i < RIVER_START_ATTEMPTS && rivers.length < RIVER_COUNT_TARGET; i += 1) {
    const start = findRiverStart(distToSea, seed, i);
    if (!start) continue;
    const path = walkRiver(start, distToSea, seed, i);
    if (path) rivers.push(smoothRiverPath(path));
  }
  return rivers;
};

/** Deterministically generates this seed's river polylines from scratch (no caching). */
export const generateRiverPaths = (seed: number): readonly RiverPath[] => buildRivers(seed);

let cachedSeed: number | undefined;
let cachedRivers: readonly RiverPath[] = [];

/** Same as generateRiverPaths(getWorldSeed()), memoized until the world seed changes. */
export const riversForCurrentSeed = (): readonly RiverPath[] => {
  const seed = getWorldSeed();
  if (cachedSeed !== seed) {
    cachedSeed = seed;
    cachedRivers = buildRivers(seed);
  }
  return cachedRivers;
};
