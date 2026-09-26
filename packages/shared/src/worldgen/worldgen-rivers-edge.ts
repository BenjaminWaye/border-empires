// v9 rivers: Civ-6-style rivers that run along tile BORDERS instead of
// through tile centres. worldgen-rivers.ts's v1-v8 walker is left untouched
// (it feeds town placement, so already-running seasons must keep their exact
// paths); worldgen-rivers.ts dispatches here for worldgenVersion >= 9.
//
// A river walks the tile-corner lattice: corner (x, y) is the top-left
// corner of tile (x, y), and every step moves one unit N/S/E/W -- i.e. along
// exactly one tile edge. An edge is only walkable when the two tiles either
// side of it are both plain LAND (never sea, never mountain), so a river is
// always a border *between two land tiles*: that's what lets the 3D
// renderer carve a channel into the shared edge and the 2D renderer stroke
// it, and what makes "river-adjacent" mean "one of the two tiles on that
// edge" for town placement.
//
// Same overall shape as the v1-v8 walker: multi-source BFS distance-to-sea
// (over corners here), start near a mountain as far from the sea as
// possible, walk strictly downhill with a seeded tie-break. No Catmull-Rom
// smoothing -- that would pull the path off the edges.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { seeded01, terrainAt } from "./worldgen.js";
import type { RiverPath, RiverPoint } from "./worldgen-rivers.js";

const RIVER_COUNT_TARGET = 10;
const RIVER_START_ATTEMPTS = 60;
const START_SCAN_ATTEMPTS_PER_RIVER = 500;
const MAX_RIVER_STEPS = 600;
const MIN_RIVER_POINTS = 6;
const NEAR_MOUNTAIN_RADIUS = 2;
const MIN_RIVER_START_DISTANCE_TO_SEA = 14;
const RIVER_MIN_HALF_WIDTH = 0.1;
const RIVER_MAX_HALF_WIDTH = 0.24;
const UNREACHED = 0xffff;

export type RiverEdgeDirection = "H" | "V";

/**
 * Key for the tile edge starting at corner (x, y): "H" runs east to corner
 * (x + 1, y) and separates tile (x, y - 1) above from tile (x, y) below; "V"
 * runs south to corner (x, y + 1) and separates tile (x - 1, y) left from
 * tile (x, y) right.
 */
export const riverEdgeKey = (x: number, y: number, dir: RiverEdgeDirection): string =>
  `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)},${dir}`;

/** The two tiles either side of the edge between two lattice-adjacent corners. */
export const tilesAlongRiverEdge = (
  ax: number,
  ay: number,
  bx: number,
  by: number
): readonly [{ x: number; y: number }, { x: number; y: number }] => {
  if (ay === by) {
    const x = toroidalMin(ax, bx, WORLD_WIDTH);
    return [
      { x, y: wrapY(ay - 1, WORLD_HEIGHT) },
      { x, y: ay }
    ];
  }
  const y = toroidalMin(ay, by, WORLD_HEIGHT);
  return [
    { x: wrapX(ax - 1, WORLD_WIDTH), y },
    { x: ax, y }
  ];
};

/** Edge key between two lattice-adjacent corners, whichever order they're given in. */
export const riverEdgeKeyBetween = (ax: number, ay: number, bx: number, by: number): string =>
  ay === by
    ? riverEdgeKey(toroidalMin(ax, bx, WORLD_WIDTH), ay, "H")
    : riverEdgeKey(ax, toroidalMin(ay, by, WORLD_HEIGHT), "V");

// For two lattice neighbours a and b = a +- 1 (with wrap), the lower index of
// the edge between them -- handles the W-1 <-> 0 wrap, where the edge starts
// at W-1, not 0.
const toroidalMin = (a: number, b: number, size: number): number => (wrapX(a + 1, size) === b ? a : b);

const isPlainLand = (x: number, y: number): boolean => terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)) === "LAND";

const isEdgeWalkable = (ax: number, ay: number, bx: number, by: number): boolean => {
  const [t0, t1] = tilesAlongRiverEdge(ax, ay, bx, by);
  return isPlainLand(t0.x, t0.y) && isPlainLand(t1.x, t1.y);
};

const cornerTouchesSea = (x: number, y: number): boolean => {
  for (const [dx, dy] of CORNER_TILE_OFFSETS) {
    const t = terrainAt(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
    if (t === "SEA" || t === "COASTAL_SEA") return true;
  }
  return false;
};

const CORNER_TILE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0]
];

const cornerNeighbors = (x: number, y: number): ReadonlyArray<readonly [number, number]> => [
  [wrapX(x + 1, WORLD_WIDTH), y],
  [wrapX(x - 1, WORLD_WIDTH), y],
  [x, wrapY(y + 1, WORLD_HEIGHT)],
  [x, wrapY(y - 1, WORLD_HEIGHT)]
];

// Multi-source BFS over corners from every sea-touching corner, moving only
// along walkable (land|land) edges. Any finite distance therefore has a
// strictly-decreasing walkable neighbour all the way to the sea, which is
// what lets walkEdgeRiver terminate without ever getting stuck.
const buildCornerDistanceToSea = (): Uint16Array => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const dist = new Uint16Array(total).fill(UNREACHED);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (!cornerTouchesSea(x, y)) continue;
      dist[y * WORLD_WIDTH + x] = 0;
      queue[tail] = y * WORLD_WIDTH + x;
      tail += 1;
    }
  }
  while (head < tail) {
    const i = queue[head]!;
    head += 1;
    const cx = i % WORLD_WIDTH;
    const cy = Math.floor(i / WORLD_WIDTH);
    const d = dist[i]! + 1;
    for (const [nx, ny] of cornerNeighbors(cx, cy)) {
      const ni = ny * WORLD_WIDTH + nx;
      if (dist[ni]! <= d || !isEdgeWalkable(cx, cy, nx, ny)) continue;
      dist[ni] = d;
      queue[tail] = ni;
      tail += 1;
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

// Scans seeded near-mountain land tiles and keeps whichever of their four
// corners is farthest (by walkable distance) from the sea -- same "prefer
// long rivers over coastal stubs" bias as the v1-v8 findRiverStart.
const findEdgeRiverStart = (
  dist: Uint16Array,
  seed: number,
  riverIndex: number,
  usedCorners: ReadonlySet<number>
): { x: number; y: number } | undefined => {
  let best: { x: number; y: number } | undefined;
  let bestDistance = 0;
  for (let attempt = 0; attempt < START_SCAN_ATTEMPTS_PER_RIVER; attempt += 1) {
    const hx = Math.floor(seeded01(riverIndex * 97 + attempt, 11, seed + 9301) * WORLD_WIDTH);
    const hy = Math.floor(seeded01(riverIndex * 131 + attempt, 23, seed + 9317) * WORLD_HEIGHT);
    if (terrainAt(hx, hy) !== "LAND" || !isNearMountain(hx, hy)) continue;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const cx = wrapX(hx + ox, WORLD_WIDTH);
      const cy = wrapY(hy + oy, WORLD_HEIGHT);
      const ci = cy * WORLD_WIDTH + cx;
      const d = dist[ci]!;
      if (d === UNREACHED || usedCorners.has(ci) || d <= bestDistance) continue;
      bestDistance = d;
      best = { x: cx, y: cy };
    }
    if (bestDistance >= MIN_RIVER_START_DISTANCE_TO_SEA) break;
  }
  return best;
};

// Meander: pure downhill BFS steps follow a shortest path, which in a
// corridor to the sea is often a dead-straight line of edges. So the walk
// may also step *sideways* along the same distance-to-sea contour (equal BFS
// distance), preferring to keep going the same way for a few edges so bends
// read as bends rather than jitter. Sideways runs are capped and never
// revisit a corner, and every downhill step strictly lowers the distance, so
// the walk still always reaches the sea.
const MEANDER_CHANCE = 0.55;
const MAX_SIDEWAYS_RUN = 3;
const SIDEWAYS_PERSISTENCE = 0.75;

const walkEdgeRiver = (start: { x: number; y: number }, dist: Uint16Array, seed: number, riverIndex: number): RiverPoint[] | undefined => {
  const points: RiverPoint[] = [];
  const visited = new Set<number>();
  let cx = start.x;
  let cy = start.y;
  let sidewaysRun = 0;
  let lastSideDx = 0;
  let lastSideDy = 0;
  const startD = dist[cy * WORLD_WIDTH + cx]!;
  for (let step = 0; step < MAX_RIVER_STEPS; step += 1) {
    const ci = cy * WORLD_WIDTH + cx;
    visited.add(ci);
    const d = dist[ci]!;
    const flowFraction = startD > 0 ? Math.min(1, Math.max(0, (startD - d) / startD)) : 1;
    points.push({ wx: cx, wy: cy, halfWidth: RIVER_MIN_HALF_WIDTH + (RIVER_MAX_HALF_WIDTH - RIVER_MIN_HALF_WIDTH) * flowFraction });
    if (d === 0) return points.length >= MIN_RIVER_POINTS ? points : undefined;
    let down: readonly [number, number] | undefined;
    let downScore = Number.POSITIVE_INFINITY;
    let side: readonly [number, number] | undefined;
    let sideScore = Number.POSITIVE_INFINITY;
    for (const n of cornerNeighbors(cx, cy)) {
      const [nx, ny] = n;
      const nd = dist[ny * WORLD_WIDTH + nx]!;
      if (nd > d || visited.has(ny * WORLD_WIDTH + nx) || !isEdgeWalkable(cx, cy, nx, ny)) continue;
      const roll = seeded01(nx * 29 + riverIndex * 3, ny * 31 + step, seed + 9427);
      if (nd < d) {
        if (roll < downScore) {
          downScore = roll;
          down = n;
        }
        continue;
      }
      // Same direction as the previous sideways run ranks first most of the time.
      const sdx = Math.sign(toroidDelta(cx, nx, WORLD_WIDTH));
      const sdy = Math.sign(toroidDelta(cy, ny, WORLD_HEIGHT));
      const continues = sidewaysRun > 0 && sdx === lastSideDx && sdy === lastSideDy;
      const score = continues ? roll * (1 - SIDEWAYS_PERSISTENCE) : roll;
      if (score < sideScore) {
        sideScore = score;
        side = n;
      }
    }
    const meander =
      side !== undefined &&
      sidewaysRun < MAX_SIDEWAYS_RUN &&
      seeded01(cx * 7 + riverIndex, cy * 11 + step, seed + 9433) < MEANDER_CHANCE;
    const next = meander ? side : down;
    if (!next) return undefined;
    if (meander) {
      lastSideDx = Math.sign(toroidDelta(cx, next[0], WORLD_WIDTH));
      lastSideDy = Math.sign(toroidDelta(cy, next[1], WORLD_HEIGHT));
      sidewaysRun += 1;
    } else {
      sidewaysRun = 0;
    }
    cx = next[0];
    cy = next[1];
  }
  return undefined;
};

// Signed shortest step from a to b on a wrapped axis of length size.
const toroidDelta = (a: number, b: number, size: number): number => {
  const d = b - a;
  return d > size / 2 ? d - size : d < -size / 2 ? d + size : d;
};

/** v9+ river generation: deterministic per seed, every step is one tile edge. */
export const generateEdgeRiverPaths = (seed: number): readonly RiverPath[] => {
  const dist = buildCornerDistanceToSea();
  const rivers: RiverPath[] = [];
  const usedCorners = new Set<number>();
  for (let i = 0; i < RIVER_START_ATTEMPTS && rivers.length < RIVER_COUNT_TARGET; i += 1) {
    const start = findEdgeRiverStart(dist, seed, i, usedCorners);
    if (!start) continue;
    const path = walkEdgeRiver(start, dist, seed, i);
    if (!path) continue;
    for (const p of path) usedCorners.add(p.wy * WORLD_WIDTH + p.wx);
    rivers.push(path);
  }
  return rivers;
};

/** Every tile edge any of these (edge-lattice) paths runs along. */
export const riverEdgeKeysOf = (paths: readonly RiverPath[]): Set<string> => {
  const keys = new Set<string>();
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      keys.add(riverEdgeKeyBetween(a.wx, a.wy, b.wx, b.wy));
    }
  }
  return keys;
};

/**
 * Every river corner (world corner index y * WORLD_WIDTH + x) mapped to the
 * widest halfWidth passing through it -- what the 3D heightfield uses to
 * decide how deep to carve that corner.
 */
export const riverCornerWidthsOf = (paths: readonly RiverPath[]): Map<number, number> => {
  const widths = new Map<number, number>();
  for (const path of paths) {
    for (const p of path) {
      const ci = p.wy * WORLD_WIDTH + p.wx;
      widths.set(ci, Math.max(widths.get(ci) ?? 0, p.halfWidth));
    }
  }
  return widths;
};
