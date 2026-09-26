// v9 edge-river channel mesh (client-map-3d-rivers.ts uses it for
// worldgenVersion >= 9; v1-v8 keep the original flat ribbon).
//
// An edge river's path is a staircase of whole tile edges. Drawn literally as
// a flat, uniform blue ribbon it read like a circuit trace painted on the
// grass, with no sense of being cut into the land. So the channel:
//  - rounds the staircase off (Chaikin corner cutting) and adds a gentle
//    wobble, while still hugging the tile borders it runs along;
//  - drapes every vertex on the real carved heightfield surface (the
//    heightfield pulls river corners down -- client-map-3d-heightfield-
//    corners.ts), sampled per vertex rather than per path point, so the
//    banks follow the valley slope instead of disappearing under it;
//  - shades a cross-section that reads as a cut from the usual top-down
//    camera: transparent ground-coloured outer edge -> earthy bank -> wet
//    mud at the waterline -> water, darkest at its shaded edges.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { wrap } from "../client-map-3d-heightfield-terrain.js";

/** A path point in camera-relative scene coords (x/z) with its river half-width. */
export type ChannelPathPoint = { readonly x: number; readonly z: number; readonly halfWidth: number };

export type ChannelBuffers = { positions: number[]; colors: number[]; indices: number[] };

const CHAIKIN_ITERATIONS = 2;
const CHAIKIN_CUT = 0.25;
const MAX_SAMPLE_SPACING = 0.2;
const WOBBLE_AMPLITUDE = 0.05;
const SOURCE_TAPER_LENGTH = 1.5;
// Cross-section, as offsets from the centreline in units of half-width,
// plus fixed widths for the bank beyond the water's edge.
const WET_BANK_WIDTH = 0.035;
const BANK_WIDTH = 0.1;
const BANK_FADE_WIDTH = 0.2;
const WATER_LIFT_Y = 0.02;
const INNER_BEND_REACH = 0.85;
const BANK_LIFT_Y = 0.015;

// Shaded as a cut, not a tube: water is darkest at its edges (in the bank's
// shadow) and lightest mid-channel (sky reflection), and the bank is earthy
// ground darkening to wet mud at the waterline. The reverse -- light edges,
// dark middle -- reads as a raised pipe lying on the grass.
type Rgba = readonly [number, number, number, number];
const GROUND: Rgba = [0.33, 0.33, 0.18, 0];
const BANK: Rgba = [0.32, 0.29, 0.17, 0.7];
const WET_MUD: Rgba = [0.17, 0.16, 0.1, 0.92];
const WATER_EDGE: Rgba = [0.14, 0.3, 0.36, 0.96];
const WATER_MID: Rgba = [0.27, 0.49, 0.6, 0.95];
// Left-to-right across the channel: [offset in half-widths, extra fixed offset, colour, lift].
const CROSS_SECTION: ReadonlyArray<readonly [number, number, Rgba, number]> = [
  [-1, -(BANK_WIDTH + BANK_FADE_WIDTH), GROUND, BANK_LIFT_Y],
  [-1, -BANK_WIDTH, BANK, BANK_LIFT_Y],
  [-1, -WET_BANK_WIDTH, WET_MUD, BANK_LIFT_Y],
  [-1, 0, WATER_EDGE, WATER_LIFT_Y],
  [0, 0, WATER_MID, WATER_LIFT_Y],
  [1, 0, WATER_EDGE, WATER_LIFT_Y],
  [1, WET_BANK_WIDTH, WET_MUD, BANK_LIFT_Y],
  [1, BANK_WIDTH, BANK, BANK_LIFT_Y],
  [1, BANK_WIDTH + BANK_FADE_WIDTH, GROUND, BANK_LIFT_Y]
];
export const CHANNEL_VERTS_PER_SECTION = CROSS_SECTION.length;

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
 * The heightfield surface at a fractional scene point, interpolated on the
 * same two triangles the heightfield draws per tile (split along the
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
 * Smoothed, densified, wobbled centreline for one run of an edge river
 * (scene coords). `phase` decorrelates the wobble between rivers.
 */
export const channelCenterline = (run: readonly ChannelPathPoint[], phase: number, isSource: boolean): ChannelPathPoint[] => {
  const dense = densify(chaikinSmooth(run));
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

/** Appends the channel's cross-sections along `centerline` (scene coords) to `buffers`. */
export const appendChannel = (
  buffers: ChannelBuffers,
  centerline: readonly ChannelPathPoint[],
  surfaceYAt: (sceneX: number, sceneZ: number) => number
): void => {
  if (centerline.length < 2) return;
  const base = buffers.positions.length / 3;
  for (let i = 0; i < centerline.length; i += 1) {
    const cur = centerline[i]!;
    const prev = centerline[Math.max(0, i - 1)]!;
    const next = centerline[Math.min(centerline.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const nx = -tz / tlen;
    const nz = tx / tlen;
    // On the inside of a tight bend the wide bank would reach past the bend's
    // centre and fold neighbouring cross-sections over each other (dark
    // scratches). Clamp inner-side offsets to most of the local turn radius
    // (circumradius of prev/cur/next; the inside is the side the path turns to).
    const turn = (cur.x - prev.x) * (next.z - cur.z) - (cur.z - prev.z) * (next.x - cur.x);
    const innerSign = Math.sign(turn);
    const a = Math.hypot(cur.x - prev.x, cur.z - prev.z);
    const b = Math.hypot(next.x - cur.x, next.z - cur.z);
    const c = Math.hypot(next.x - prev.x, next.z - prev.z);
    const innerLimit = turn === 0 ? Infinity : ((a * b * c) / (2 * Math.abs(turn))) * INNER_BEND_REACH;
    for (const [halfWidths, fixed, color, lift] of CROSS_SECTION) {
      const raw = halfWidths * cur.halfWidth + fixed;
      const offset = Math.sign(raw) === innerSign ? Math.sign(raw) * Math.min(Math.abs(raw), innerLimit) : raw;
      const x = cur.x + nx * offset;
      const z = cur.z + nz * offset;
      buffers.positions.push(x, surfaceYAt(x, z) + lift, z);
      buffers.colors.push(color[0], color[1], color[2], color[3]);
    }
  }
  const n = CHANNEL_VERTS_PER_SECTION;
  for (let i = 0; i + 1 < centerline.length; i += 1) {
    for (let k = 0; k + 1 < n; k += 1) {
      const a = base + i * n + k;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      buffers.indices.push(a, c, b, b, c, d);
    }
  }
};
