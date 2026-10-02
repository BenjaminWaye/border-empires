// v9 edge-river geometry helpers shared by the river valley terrain mesh
// (client-map-3d-river-valley.ts) and the river's water surface
// (client-map-3d-rivers.ts). v1-v8 keep the original flat ribbon.
//
// An edge river's path is a staircase of whole tile edges. The rendered
// river follows a smoothed centreline through that staircase (Chaikin
// corner cutting + a gentle wobble, still hugging the tile borders), and a
// single trench profile -- depth as a function of distance from that
// centreline -- is used both to carve the valley terrain (a real channel
// with a flat bed and sloping banks) and to decide where the water sits.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";

/** A path point in camera-relative scene coords (x/z) with its river half-width. */
export type ChannelPathPoint = { readonly x: number; readonly z: number; readonly halfWidth: number };

const CHAIKIN_ITERATIONS = 2;
const CHAIKIN_CUT = 0.25;
const MAX_SAMPLE_SPACING = 0.2;
const WOBBLE_AMPLITUDE = 0.05;
const SOURCE_TAPER_LENGTH = 1.5;

// Trench profile. The bed is flat out to BED_FRACTION of the half-width,
// then the bank rises smoothly to ground level BANK_WIDTH beyond the
// half-width. The whole trench (widest river: 0.24 + 0.22) stays well under
// the ~0.95 distance between a river and the nearest tile edge the valley
// mesh shares with regular terrain, so those shared edges are never carved.
export const TRENCH_DEPTH = 0.16;
const BED_FRACTION = 0.8;
const BANK_WIDTH = 0.22;
// Water fills the trench to this fraction of its depth, so the upper bank
// stays visible above the waterline.
const WATER_FILL = 0.45;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How far below the surrounding ground the carved trench is, `distance` from the centreline. */
export const riverTrenchDepth = (distance: number, halfWidth: number): number => {
  if (halfWidth <= 0) return 0;
  const bed = halfWidth * BED_FRACTION;
  if (distance <= bed) return TRENCH_DEPTH;
  return TRENCH_DEPTH * (1 - smoothstep(bed, halfWidth + BANK_WIDTH, distance));
};

/** Water surface depth below the ground at the centreline. */
export const RIVER_WATER_DEPTH = TRENCH_DEPTH * (1 - WATER_FILL);

/**
 * Half-width of the water surface: a little past where the bank rises
 * through the waterline, so the water's edge tucks under the bank (the
 * terrain above hides the overshoot) instead of leaving a dry seam.
 */
export const riverWaterHalfWidth = (halfWidth: number): number => {
  let lo = halfWidth * BED_FRACTION;
  let hi = halfWidth + BANK_WIDTH;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    if (riverTrenchDepth(mid, halfWidth) > RIVER_WATER_DEPTH) lo = mid;
    else hi = mid;
  }
  return lo + 0.02;
};

/** Chaikin corner cutting: rounds right-angle bends while keeping both endpoints. */
export const chaikinSmooth = (points: readonly ChannelPathPoint[], iterations = CHAIKIN_ITERATIONS): ChannelPathPoint[] => {
  let pts: ChannelPathPoint[] = [...points];
  for (let it = 0; it < iterations && pts.length >= 3; it += 1) {
    const next: ChannelPathPoint[] = [pts[0]!];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const lerp = (t: number): ChannelPathPoint => ({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t
      });
      next.push(lerp(CHAIKIN_CUT), lerp(1 - CHAIKIN_CUT));
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
};

const densify = (points: readonly ChannelPathPoint[]): ChannelPathPoint[] => {
  const out: ChannelPathPoint[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / MAX_SAMPLE_SPACING));
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t });
    }
  }
  if (points.length > 0) out.push(points[points.length - 1]!);
  return out;
};

/**
 * The regular heightfield surface at a fractional scene point, interpolated
 * on the same two triangles the heightfield draws per tile (split along the
 * (1,0)-(0,1) diagonal -- client-map-3d-heightfield.ts's index buffer).
 */
export const heightfieldSurfaceY = (
  sceneX: number,
  sceneZ: number,
  camX: number,
  camY: number,
  cornerYAt: (cornerX: number, cornerZ: number) => number
): number => {
  const worldX = camX + sceneX;
  const worldZ = camY + sceneZ;
  const ix = Math.floor(worldX);
  const iz = Math.floor(worldZ);
  const fx = worldX - ix;
  const fz = worldZ - iz;
  const x0 = wrap(ix, WORLD_WIDTH);
  const x1 = wrap(ix + 1, WORLD_WIDTH);
  const z0 = wrap(iz, WORLD_HEIGHT);
  const z1 = wrap(iz + 1, WORLD_HEIGHT);
  const c10 = cornerYAt(x1, z0);
  const c01 = cornerYAt(x0, z1);
  if (fx + fz <= 1) {
    const c00 = cornerYAt(x0, z0);
    return c00 + (c10 - c00) * fx + (c01 - c00) * fz;
  }
  const c11 = cornerYAt(x1, z1);
  return c11 + (c01 - c11) * (1 - fx) + (c10 - c11) * (1 - fz);
};

/**
 * Smoothed, densified, wobbled centreline for a run of an edge river (scene
 * coords). `phase` decorrelates the wobble between rivers; a run that starts
 * at the river's source tapers in over SOURCE_TAPER_LENGTH.
 */
export const channelCenterline = (path: readonly ChannelPathPoint[], phase: number, isSource: boolean): ChannelPathPoint[] => {
  const dense = densify(chaikinSmooth(path));
  let arc = 0;
  return dense.map((p, i) => {
    if (i > 0) arc += Math.hypot(p.x - dense[i - 1]!.x, p.z - dense[i - 1]!.z);
    const prev = dense[Math.max(0, i - 1)]!;
    const next = dense[Math.min(dense.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const endFade = i === 0 || i === dense.length - 1 ? 0 : 1;
    const wobble = endFade * WOBBLE_AMPLITUDE * (Math.sin(arc * 2.1 + phase) * 0.7 + Math.sin(arc * 5.3 + phase * 1.7) * 0.3);
    const taper = isSource ? Math.min(1, 0.35 + (0.65 * arc) / SOURCE_TAPER_LENGTH) : 1;
    return { x: p.x + (-tz / tlen) * wobble, z: p.z + (tx / tlen) * wobble, halfWidth: p.halfWidth * taper };
  });
};

/** A centreline segment (two consecutive centreline samples, scene coords). */
export type CenterlineSegment = { readonly a: ChannelPathPoint; readonly b: ChannelPathPoint };

/** Out-param for nearest-segment queries (reused, so the per-vertex loop doesn't allocate). */
export type NearestCenterline = { distance: number; halfWidth: number };

/**
 * Nearest point on any of `segments` to (x, z): writes distance + the river
 * half-width there into `out`, returns false if `segments` is empty.
 */
export const nearestOnSegments = (segments: readonly CenterlineSegment[], x: number, z: number, out: NearestCenterline): boolean => {
  let found = false;
  for (const { a, b } of segments) {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * vx + (z - a.z) * vz) / len2));
    const distance = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (!found || distance < out.distance) {
      out.distance = distance;
      out.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
      found = true;
    }
  }
  return found;
};

/** Centreline segments bucketed by tile, so the valley mesh only checks nearby ones. */
export type CenterlineIndex = {
  /**
   * Every segment that can reach into scene tile (tx, tz) -- enough for any
   * point in the tile or within one tile of it (the trench reaches ~0.46).
   */
  readonly segmentsNearTile: (tx: number, tz: number) => CenterlineSegment[];
};

export const indexCenterlines = (centerlines: ReadonlyArray<readonly ChannelPathPoint[]>): CenterlineIndex => {
  const buckets = new Map<number, CenterlineSegment[]>();
  const bucketKey = (tx: number, tz: number): number => tx * 100003 + tz;
  for (const line of centerlines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const seg = { a: line[i]!, b: line[i + 1]! };
      const key = bucketKey(Math.floor((seg.a.x + seg.b.x) / 2), Math.floor((seg.a.z + seg.b.z) / 2));
      const list = buckets.get(key);
      if (list) list.push(seg);
      else buckets.set(key, [seg]);
    }
  }
  const segmentsNearTile = (tx: number, tz: number): CenterlineSegment[] => {
    const out: CenterlineSegment[] = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const list = buckets.get(bucketKey(tx + dx, tz + dz));
        if (list) out.push(...list);
      }
    }
    return out;
  };
  return { segmentsNearTile };
};

export type WaterBuffers = { positions: number[]; colors: number[]; uvs: number[]; indices: number[] };

// Water colours sit in the ocean's palette (client-map-3d-water-surface.ts
// DEEP_COLOR/SHALLOW_COLOR) -- it's drawn with the ocean's own material.
const WATER_MID: readonly [number, number, number] = [0.16, 0.39, 0.5];
const WATER_EDGE: readonly [number, number, number] = [0.33, 0.62, 0.68];

/**
 * Appends a flat water strip along `run` (a centreline run, scene coords):
 * three vertices per sample (edge, middle, edge), level across the channel
 * at `waterYAt(centre)`, with world-anchored UVs for the ocean's normal maps.
 */
export const appendWater = (
  buffers: WaterBuffers,
  run: readonly ChannelPathPoint[],
  waterYAt: (sceneX: number, sceneZ: number) => number,
  uvAt: (sceneX: number, sceneZ: number) => readonly [number, number]
): void => {
  if (run.length < 2) return;
  const base = buffers.positions.length / 3;
  for (let i = 0; i < run.length; i += 1) {
    const cur = run[i]!;
    const prev = run[Math.max(0, i - 1)]!;
    const next = run[Math.min(run.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const w = riverWaterHalfWidth(cur.halfWidth);
    const nx = (-tz / tlen) * w;
    const nz = (tx / tlen) * w;
    const y = waterYAt(cur.x, cur.z);
    for (const [ox, oz, color] of [[-nx, -nz, WATER_EDGE], [0, 0, WATER_MID], [nx, nz, WATER_EDGE]] as const) {
      const x = cur.x + ox;
      const z = cur.z + oz;
      buffers.positions.push(x, y, z);
      buffers.colors.push(color[0], color[1], color[2]);
      const [u, v] = uvAt(x, z);
      buffers.uvs.push(u, v);
    }
  }
  for (let i = 0; i + 1 < run.length; i += 1) {
    for (let k = 0; k < 2; k += 1) {
      const a = base + i * 3 + k;
      const b = a + 1;
      const c = a + 3;
      const d = c + 1;
      buffers.indices.push(a, c, b, b, c, d);
    }
  }
};
