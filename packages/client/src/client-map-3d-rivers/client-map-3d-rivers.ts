// Purely decorative rivers: a deterministic set of meandering polylines from
// a mountain down to the coast, rendered as a thin ribbon mesh laid over the
// existing heightfield. No gameplay, movement, or adjacency effect — this
// module reads world-gen state (terrainAt/landBiomeAt) but never writes
// anything, and nothing outside this file and its one wiring point in
// client-map-3d.ts knows rivers exist. Deleting both is a full revert.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import {
  getWorldSeed,
  isHillsTileAt,
  landBiomeAt,
  seeded01,
  terrainAt,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import {
  heightfieldFlatTileElevation,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  wrap,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield-terrain.js";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";

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
// this look (see client-map-3d-road-overlay.ts's Bezier arms for the same
// idea applied to roads).
const CURVE_SAMPLES_PER_SEGMENT = 4;
// Lift above the real ground surface — same "surface lift to win the depth
// test against sloped terrain" technique as client-map-3d-contact-shadow.
const SURFACE_LIFT_Y = 0.025;
// Visual family with the ocean (client-map-3d-water-surface.ts's
// DEEP_COLOR/SHALLOW_COLOR) without importing that module's heavier
// dual-normal-map material — a thin land ribbon at close camera range
// doesn't need the ocean's animated chop.
const RIVER_COLOR = new Color(0x3f7fa0);

type RiverPoint = { readonly wx: number; readonly wy: number; readonly halfWidth: number };
type RiverPath = readonly RiverPoint[];

const kindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
  const terrain = terrainAt(wx, wy);
  if (terrain === "SEA") return "SEA";
  if (terrain === "COASTAL_SEA") return "COASTAL_SEA";
  if (terrain === "MOUNTAIN") return "MOUNTAIN";
  const biome = landBiomeAt(wx, wy);
  if (biome === "SAND" || biome === "COASTAL_SAND") return "SAND";
  if (biome === "TUNDRA") return "TUNDRA";
  return "GRASS";
};

// The real heightfield renders each *corner* as an average of its 4
// surrounding tiles' elevations (client-map-3d-heightfield.ts), not a
// single tile's own value — so a point sitting one tile from a MOUNTAIN
// (elevation ~1.15, vs. ~0.07-0.20 for flat land) can have a real rendered
// ground surface well above what heightfieldFlatTileElevation reports for
// its own tile alone. Taking the max elevation over the tile and its 8
// neighbours is a safe upper bound for any corner blend touching this point
// — corner averaging can never exceed the highest contributing tile.
// Exported (rather than a private closure) so this can be tested with a
// synthetic tileKindAt, the same injection pattern client-map-3d-heightfield
// tests already use, instead of needing real world-gen state.
export const maxNearbyElevation = (
  wx: number,
  wy: number,
  tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind,
  // Hills are a dome mesh bolted on top of the flat grid (see
  // client-map-3d-hills.ts), invisible to heightfieldFlatTileElevation —
  // without this bonus the river ribbon renders under the dome bulge
  // wherever its path crosses a hills tile. Injectable (like tileKindAt
  // above) so this stays testable with synthetic tile state instead of
  // needing real world-gen.
  isHillsAt: (wx: number, wy: number) => boolean = isHillsTileAt
): number => {
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = wrap(tx + dx, WORLD_WIDTH);
      const ny = wrap(ty + dy, WORLD_HEIGHT);
      const kind = tileKindAt(nx, ny);
      if (kind === "SEA" || kind === "COASTAL_SEA") continue;
      const elevation =
        heightfieldFlatTileElevation(nx, ny, kind) + (isHillsAt(nx, ny) ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0);
      if (elevation > maxElevation) maxElevation = elevation;
    }
  }
  return maxElevation;
};

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
      [wrap(cx + 1, WORLD_WIDTH), cy],
      [wrap(cx - 1, WORLD_WIDTH), cy],
      [cx, wrap(cy + 1, WORLD_HEIGHT)],
      [cx, wrap(cy - 1, WORLD_HEIGHT)]
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
      if (terrainAt(wrap(x + dx, WORLD_WIDTH), wrap(y + dy, WORLD_HEIGHT)) === "MOUNTAIN") return true;
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
    // COASTAL_SEA tile itself (d=0) guarantees the ribbon overlaps the
    // water plane there instead of leaving a gap.
    if (d <= 0) break;
    let bestX = cx;
    let bestY = cy;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrap(cx + dx, WORLD_WIDTH);
        const ny = wrap(cy + dy, WORLD_HEIGHT);
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

const catmullRom1D = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
};

// Fits a Catmull-Rom curve through the raw walked points and re-samples it at
// CURVE_SAMPLES_PER_SEGMENT points per original segment, replacing the
// straight-line-between-wobbled-points look with a smooth meander. Endpoints
// clamp their missing neighbour to themselves (standard Catmull-Rom
// treatment) so the curve still starts/ends exactly on the source and mouth.
const smoothRiverPath = (path: RiverPath): RiverPath => {
  if (path.length < 3) return path;
  const at = (i: number): RiverPoint => path[Math.min(Math.max(i, 0), path.length - 1)]!;
  const smoothed: RiverPoint[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < CURVE_SAMPLES_PER_SEGMENT; s += 1) {
      const t = s / CURVE_SAMPLES_PER_SEGMENT;
      smoothed.push({
        wx: catmullRom1D(p0.wx, p1.wx, p2.wx, p3.wx, t),
        wy: catmullRom1D(p0.wy, p1.wy, p2.wy, p3.wy, t),
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

let cachedSeed: number | undefined;
let cachedRivers: readonly RiverPath[] = [];

const riversForCurrentSeed = (): readonly RiverPath[] => {
  const seed = getWorldSeed();
  if (cachedSeed !== seed) {
    cachedSeed = seed;
    cachedRivers = buildRivers(seed);
  }
  return cachedRivers;
};

export type RiverOverlayRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  // Same explored/fogged predicate the heightfield uses (client-map-3d.ts's
  // isExploredForHeightfield) — without it river segments drew straight
  // through unexplored fog since this overlay only ever culled by camera
  // distance, never by what the player has actually seen.
  readonly isExploredAt: (wx: number, wy: number) => boolean;
};

export type RiverOverlay = {
  readonly rebuild: (inputs: RiverOverlayRebuildInputs) => void;
  readonly dispose: () => void;
};

export const createRiverOverlay = (scene: Scene): RiverOverlay => {
  const material = new MeshStandardMaterial({
    color: RIVER_COLOR,
    roughness: 0.32,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide
  });

  let mesh: Mesh | null = null;
  let geometry: BufferGeometry | null = null;

  // Without accounting for nearby terrain (see maxNearbyElevation above),
  // the ribbon rendered underground for a stretch near every mountain
  // source, reading as the river getting "cut off" right where it should
  // visibly begin.
  const surfaceYAt = (wx: number, wy: number): number => maxNearbyElevation(wx, wy, kindAt) + SURFACE_LIFT_Y;

  const rebuild = (inputs: RiverOverlayRebuildInputs): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh = null;
    }
    if (geometry) {
      geometry.dispose();
      geometry = null;
    }

    const { camX, camY, halfW, halfH, isExploredAt } = inputs;
    const marginW = halfW + 2;
    const marginH = halfH + 2;
    const rivers = riversForCurrentSeed();

    const positions: number[] = [];
    const indices: number[] = [];

    type ScenePoint = { readonly x: number; readonly z: number; readonly y: number; readonly halfWidth: number };

    // Culling (view margin, fog-of-war) is per-point, which can chop one
    // river into several disjoint visible stretches. Each stretch is built
    // as its own shared-vertex ribbon strip — sharing a vertex between
    // consecutive segments (rather than each segment owning independent
    // corners, as before) is what removes the gap/overlap at every bend,
    // the same technique client-map-3d-road-overlay.ts uses for road arms.
    const pushRibbonStrip = (run: readonly ScenePoint[]): void => {
      if (run.length < 2) return;
      const base = positions.length / 3;
      for (let i = 0; i < run.length; i += 1) {
        const prev = run[Math.max(i - 1, 0)]!;
        const next = run[Math.min(i + 1, run.length - 1)]!;
        const tx = next.x - prev.x;
        const tz = next.z - prev.z;
        const tlen = Math.hypot(tx, tz) || 1;
        const cur = run[i]!;
        // Perpendicular unit vector (in the XZ plane) to the local tangent,
        // scaled by this point's own taper width.
        const px = (-tz / tlen) * cur.halfWidth;
        const pz = (tx / tlen) * cur.halfWidth;
        positions.push(cur.x - px, cur.y, cur.z - pz, cur.x + px, cur.y, cur.z + pz);
      }
      for (let i = 0; i < run.length - 1; i += 1) {
        const li = base + i * 2;
        const ri = li + 1;
        const li1 = li + 2;
        const ri1 = li + 3;
        indices.push(li, li1, ri, ri, li1, ri1);
      }
    };

    for (const path of rivers) {
      let run: ScenePoint[] = [];
      for (const p of path) {
        const x = toroidDelta(camX, p.wx, WORLD_WIDTH);
        const z = toroidDelta(camY, p.wy, WORLD_HEIGHT);
        // Drop (and break the run at) points outside the visible window or
        // unexplored fog — same two guards the old per-segment loop applied,
        // now checked per-point so a run only ever contains drawable points.
        const inView = Math.abs(x) <= marginW && Math.abs(z) <= marginH;
        const explored = isExploredAt(Math.floor(p.wx), Math.floor(p.wy));
        if (!inView || !explored) {
          pushRibbonStrip(run);
          run = [];
          continue;
        }
        run.push({ x, z, y: surfaceYAt(p.wx, p.wy), halfWidth: p.halfWidth });
      }
      pushRibbonStrip(run);
    }

    if (positions.length === 0) return;

    geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
  };

  const dispose = (): void => {
    if (mesh) scene.remove(mesh);
    geometry?.dispose();
    material.dispose();
  };

  return { rebuild, dispose };
};
