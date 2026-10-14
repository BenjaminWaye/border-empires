import type { IncursionEdges } from "./client-reach-incursion.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";

// "Breach" outlines for incursion pockets (rival land inside my reach -- see
// client-reach-incursion.ts). Where a pocket side borders MY land, the plain
// strip can be replaced by spikes, a jagged line or a shattered wall with
// cracks (client-incursion-breach-style.ts picks which). Sides bordering
// unowned or third-party land always keep the plain strip, so the breach look
// only ever points at what's under threat.
//
// Pure geometry, renderer-agnostic: convex polygons in TILE-LOCAL space (the
// tile spans [-0.5, 0.5] on both axes, +x east, +y south = scene +z), so the
// 3D overlay can fan-triangulate them and a 2D path can fill them as-is.
// Shapes may reach up to ~0.6 of a tile past the tile's own edge, into the
// neighbouring tile -- that's the point.

export type BreachPoint = { readonly x: number; readonly y: number };

/** One convex polygon, drawn in the pocket's outline colour (incursionMarkColor). */
export type BreachShape = { readonly points: readonly BreachPoint[] };

/** What sits at offset (dx, dy) from the pocket tile: more of this pocket, my land, or anything else. */
export type BreachNeighbourKind = "pocket" | "mine" | "other";

export type IncursionBreachOutline = {
  /** Sides that still get the plain strip (every pocket side that does NOT face my land, or all of them for "straight"). */
  readonly straightEdges: IncursionEdges;
  /** Breach shapes for the sides that face my land, in drawing order. */
  readonly shapes: readonly BreachShape[];
};

type Side = {
  readonly key: keyof IncursionEdges;
  readonly index: number;
  /** Corner the side starts at, its unit tangent, and its outward normal. */
  readonly a: BreachPoint;
  readonly t: BreachPoint;
  readonly n: BreachPoint;
};

const SIDES: readonly Side[] = [
  { key: "north", index: 0, a: { x: -0.5, y: -0.5 }, t: { x: 1, y: 0 }, n: { x: 0, y: -1 } },
  { key: "east", index: 1, a: { x: 0.5, y: -0.5 }, t: { x: 0, y: 1 }, n: { x: 1, y: 0 } },
  { key: "south", index: 2, a: { x: 0.5, y: 0.5 }, t: { x: -1, y: 0 }, n: { x: 0, y: 1 } },
  { key: "west", index: 3, a: { x: -0.5, y: 0.5 }, t: { x: 0, y: -1 }, n: { x: -1, y: 0 } }
];

/** Same strip width (fraction of a tile) both incursion renderers use for the plain edge. */
export const INCURSION_STRIP_WIDTH = 0.07;

// GLSL-style hash (same family as client-breach-border.ts's tornHash): stable
// per world tile / side / index, so shapes never flicker between rebuilds and
// don't shift when the camera's scene origin moves.
const hash = (a: number, b: number, c: number, d: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 269.5) * 43758.5453;
  return h - Math.floor(h);
};

const add = (p: BreachPoint, q: BreachPoint, s = 1): BreachPoint => ({ x: p.x + q.x * s, y: p.y + q.y * s });

/** One side, resolved to its corners in tile-local space plus a seed. */
type SideFrame = { readonly a: BreachPoint; readonly b: BreachPoint; readonly t: BreachPoint; readonly n: BreachPoint; readonly seed: number };

const along = (f: SideFrame, u: number, out = 0): BreachPoint => add(add(f.a, f.t, u), f.n, out);

/** Thick segment p->q as a quad, centred on the segment, tapering from `w0` to `w1`. */
const segmentQuad = (p: BreachPoint, q: BreachPoint, w0: number, w1 = w0): BreachPoint[] => {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  return [
    { x: p.x + (nx * w0) / 2, y: p.y + (ny * w0) / 2 },
    { x: q.x + (nx * w1) / 2, y: q.y + (ny * w1) / 2 },
    { x: q.x - (nx * w1) / 2, y: q.y - (ny * w1) / 2 },
    { x: p.x - (nx * w0) / 2, y: p.y - (ny * w0) / 2 }
  ];
};

/** Hexagon that rounds off a polyline joint. */
const joint = (c: BreachPoint, r: number): BreachPoint[] =>
  Array.from({ length: 6 }, (_, i) => ({ x: c.x + Math.cos((i * Math.PI) / 3) * r, y: c.y + Math.sin((i * Math.PI) / 3) * r }));

const polyline = (pts: readonly BreachPoint[], width: number, taperTo = width): BreachShape[] => {
  const out: BreachShape[] = [];
  const last = pts.length - 1;
  for (let i = 0; i < last; i += 1) {
    const w0 = width + (taperTo - width) * (i / last);
    const w1 = width + (taperTo - width) * ((i + 1) / last);
    out.push({ points: segmentQuad(pts[i]!, pts[i + 1]!, w0, w1) });
    if (i > 0) out.push({ points: joint(pts[i]!, w0 / 2) });
  }
  return out;
};

const insideStrip = (f: SideFrame, width: number): BreachShape => ({
  points: [f.a, f.b, add(f.b, f.n, -width), add(f.a, f.n, -width)]
});

// --- Spikes: a front-line marker in the style of Hearts of Iron IV -- a solid
// outline with small, evenly spaced teeth in the same colour, all pointing
// out into my tile (the direction the intruder is pushing). Deliberately
// regular, not random: it should read as a map symbol, not damage.
const TEETH_PER_SIDE = 4;
const TOOTH_HEIGHT = 0.17;
const TOOTH_BASE = 0.13;
const spikes = (f: SideFrame, concaveAtA: boolean, concaveAtB: boolean): BreachShape[] => {
  const out: BreachShape[] = [insideStrip(f, INCURSION_STRIP_WIDTH)];
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    // At an inside corner the neighbouring pocket side's end tooth points into
    // the same tile, so drop ours there or the two collide.
    if ((i === 0 && concaveAtA) || (i === TEETH_PER_SIDE - 1 && concaveAtB)) continue;
    const u = (i + 0.5) / TEETH_PER_SIDE;
    out.push({ points: [along(f, u - TOOTH_BASE / 2, -0.01), along(f, u + TOOTH_BASE / 2, -0.01), along(f, u, TOOTH_HEIGHT)] });
  }
  return out;
};

// --- Jagged: an irregular zig-zag pinned to the tile corners so neighbouring
// tiles' lines join up -- the same torn-paper language as the Breakthrough
// Momentum breach edge (client-breach-border.ts).
const JAG_SEGMENTS = 7;
const jagged = (f: SideFrame): BreachShape[] => {
  const pts: BreachPoint[] = [];
  for (let i = 0; i <= JAG_SEGMENTS; i += 1) {
    const pinned = i === 0 || i === JAG_SEGMENTS;
    const swing = pinned ? 0 : (i % 2 === 0 ? -1 : 1) * (0.04 + hash(f.seed, i, 3, 0) * 0.1);
    pts.push(along(f, i / JAG_SEGMENTS, swing - 0.02));
  }
  return polyline(pts, 0.07);
};

// --- Shattered: offset, slightly tilted wall chunks with gaps; from each gap a
// tapering crack (with a side branch) runs out into my tile.
const CHUNKS_PER_SIDE = 3;
const CHUNK_GAP = 0.1;
const shattered = (f: SideFrame): BreachShape[] => {
  const out: BreachShape[] = [];
  for (let i = 0; i < CHUNKS_PER_SIDE; i += 1) {
    const u0 = i / CHUNKS_PER_SIDE + (i === 0 ? 0 : CHUNK_GAP / 2);
    const u1 = (i + 1) / CHUNKS_PER_SIDE - (i === CHUNKS_PER_SIDE - 1 ? 0 : CHUNK_GAP / 2);
    const shift = (hash(f.seed, i, 4, 0) - 0.5) * 0.09;
    const tilt = (hash(f.seed, i, 5, 0) - 0.5) * 0.1;
    out.push({ points: segmentQuad(along(f, u0, -0.04 + shift + tilt), along(f, u1, -0.04 + shift - tilt), 0.095) });
  }
  for (let g = 1; g < CHUNKS_PER_SIDE; g += 1) {
    const u = g / CHUNKS_PER_SIDE;
    const length = 0.34 + hash(f.seed, g, 6, 0) * 0.2;
    const crack: BreachPoint[] = [along(f, u)];
    for (let k = 1; k <= 3; k += 1) crack.push(along(f, u + (hash(f.seed, g, 7, k) - 0.5) * 0.12, (length * k) / 3));
    out.push(...polyline(crack, 0.075, 0.015));
    const fork = crack[1]!;
    const forkDir = hash(f.seed, g, 8, 0) > 0.5 ? 1 : -1;
    out.push(...polyline([fork, add(add(fork, f.n, length * 0.35), f.t, forkDir * 0.14)], 0.045, 0.01));
  }
  return out;
};

/**
 * Breach outline for one incursion tile. `kindAt(dx, dy)` classifies the tile
 * at that offset; (worldX, worldY) only seed the shape variation.
 */
export const incursionBreachOutline = (
  style: IncursionBreachStyle,
  worldX: number,
  worldY: number,
  kindAt: (dx: number, dy: number) => BreachNeighbourKind
): IncursionBreachOutline => {
  const straight = { north: false, east: false, south: false, west: false };
  const shapes: BreachShape[] = [];
  for (const side of SIDES) {
    const across = kindAt(side.n.x, side.n.y);
    if (across === "pocket") continue;
    if (style === "straight" || across !== "mine") {
      straight[side.key] = true;
      continue;
    }
    const frame: SideFrame = { a: side.a, b: add(side.a, side.t), t: side.t, n: side.n, seed: worldX * 4.13 + worldY * 131.7 + side.index };
    if (style === "spikes") {
      const concaveAtA = kindAt(side.n.x - side.t.x, side.n.y - side.t.y) === "pocket";
      const concaveAtB = kindAt(side.n.x + side.t.x, side.n.y + side.t.y) === "pocket";
      shapes.push(...spikes(frame, concaveAtA, concaveAtB));
    } else if (style === "jagged") shapes.push(...jagged(frame));
    else shapes.push(...shattered(frame));
  }
  return { straightEdges: straight, shapes };
};

/** Triangles a shape list fans into -- lets callers budget their buffers. */
export const breachShapeTriangleCount = (shapes: readonly BreachShape[]): number =>
  shapes.reduce((sum, shape) => sum + Math.max(0, shape.points.length - 2), 0);
