// The spikes-style front line around one incursion tile (see
// client-incursion-breach-layout.ts), after Hearts of Iron IV: one solid
// shape in the attacker's colour -- a thin line with small, widely spaced
// teeth standing on it -- drawn ORGANICALLY rather than along the tile grid:
//   - corners where the boundary turns are rounded (outer corners curve
//     inside the pocket, inner corners curve out round my tile);
//   - every point is pushed by a smooth noise field sampled in WORLD space,
//     so the line meanders gently, and since a shared world point always
//     moves the same way, neighbouring tiles' pieces still meet exactly;
//   - teeth follow the curve's normal, with one on each rounded outer corner.
// Pure + renderer-agnostic: convex polygons in tile-local space (the tile
// spans [-0.5, 0.5] on both axes, +x east, +y south = scene +z).

export type BreachPoint = { readonly x: number; readonly y: number };

/** One convex piece (a line segment or half a tooth), drawn in the attacker's colour times `shade` (1 = lit). */
export type BreachFrontPiece = { readonly points: readonly BreachPoint[]; readonly shade: number };

/** What sits at offset (dx, dy) from the pocket tile. */
export type FrontNeighbourKind = "pocket" | "mine" | "other";

/** One open side of the pocket tile: outward direction (dx, dy), its start corner, and its unit tangent (clockwise round the pocket). */
export type FrontSide = { readonly dx: number; readonly dy: number; readonly a: BreachPoint; readonly t: BreachPoint };

const LINE_WIDTH = 0.035;
const TEETH_PER_SIDE = 3;
const TOOTH_HEIGHT = 0.16;
const TOOTH_HALF_BASE = 0.065;
/** Light comes from the north-west; the tooth half facing away from it is shaded. */
const TOWARD_LIGHT = { x: -0.6, y: -0.8 };
const SHADED = 0.72;
/** Rounding radius (tiles) where the front line turns a corner; the 3D hatch rounds its outer corners to match. */
export const FRONT_CORNER_RADIUS = 0.28;
const CORNER_RADIUS = FRONT_CORNER_RADIUS;
/** Meander: how far (in tiles) and how broadly (noise cells per tile) the line wanders. */
const WARP_AMPLITUDE = 0.075;
const WARP_FREQUENCY = 0.85;
const STRAIGHT_STEPS = 8;
const ARC_STEPS = 6;

const fract = (v: number): number => v - Math.floor(v);
const lattice = (ix: number, iy: number, seed: number): number => fract(Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth 2D value noise in [-1, 1]. */
const noise = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = smooth(x - ix);
  const v = smooth(y - iy);
  const top = lattice(ix, iy, seed) * (1 - u) + lattice(ix + 1, iy, seed) * u;
  const bottom = lattice(ix, iy + 1, seed) * (1 - u) + lattice(ix + 1, iy + 1, seed) * u;
  return (top * (1 - v) + bottom * v) * 2 - 1;
};

/** Pushes a tile-local point by the world-space meander field. Same world point in, same offset out. */
const warpAt =
  (worldX: number, worldY: number) =>
  (p: BreachPoint): BreachPoint => {
    const wx = (worldX + p.x) * WARP_FREQUENCY;
    const wy = (worldY + p.y) * WARP_FREQUENCY;
    return { x: p.x + noise(wx, wy, 1) * WARP_AMPLITUDE, y: p.y + noise(wx, wy, 2) * WARP_AMPLITUDE };
  };

const add = (p: BreachPoint, q: BreachPoint, s = 1): BreachPoint => ({ x: p.x + q.x * s, y: p.y + q.y * s });
const unit = (p: BreachPoint): BreachPoint => {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
};

type CornerTurn = "straight" | "outer" | "inner";

/** How the boundary continues past one end of a side: on along the next tile, round an outer corner, or round an inner one. */
const cornerTurn = (side: FrontSide, along: 1 | -1, kindAt: (dx: number, dy: number) => FrontNeighbourKind): CornerTurn => {
  if (kindAt(side.dx + side.t.x * along, side.dy + side.t.y * along) === "pocket") return "inner";
  return kindAt(side.t.x * along, side.t.y * along) === "pocket" ? "straight" : "outer";
};

/** Whether the boundary turns an OUTER corner at this side's start corner (the corner the hatch must round off). */
export const isOuterStartCorner = (side: FrontSide, kindAt: (dx: number, dy: number) => FrontNeighbourKind): boolean => cornerTurn(side, -1, kindAt) === "outer";

/** Quarter arc from `from` to `to` about `centre` (from - centre is perpendicular to to - centre). */
const quarterArc = (centre: BreachPoint, from: BreachPoint, to: BreachPoint): BreachPoint[] => {
  const a = add(from, centre, -1);
  const b = add(to, centre, -1);
  return Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const angle = (i / ARC_STEPS) * (Math.PI / 2);
    return { x: centre.x + a.x * Math.cos(angle) + b.x * Math.sin(angle), y: centre.y + a.y * Math.cos(angle) + b.y * Math.sin(angle) };
  });
};

/** Thick polyline with mitred joints (per-vertex averaged normals), so bends don't crack. */
const strip = (pts: readonly BreachPoint[]): BreachFrontPiece[] => {
  const segNormals = pts.slice(1).map((q, i) => unit({ x: -(q.y - pts[i]!.y), y: q.x - pts[i]!.x }));
  const vertexNormal = (i: number): BreachPoint => unit(add(segNormals[Math.max(0, i - 1)]!, segNormals[Math.min(segNormals.length - 1, i)]!));
  const h = LINE_WIDTH / 2;
  return segNormals.map((_, i) => {
    const m0 = vertexNormal(i);
    const m1 = vertexNormal(i + 1);
    return { points: [add(pts[i]!, m0, h), add(pts[i + 1]!, m1, h), add(pts[i + 1]!, m1, -h), add(pts[i]!, m0, -h)], shade: 1 };
  });
};

/** One tooth standing on the warped curve at `base`, pointing along the curve normal on the `outward` side. */
const tooth = (warp: (p: BreachPoint) => BreachPoint, base: BreachPoint, tangent: BreachPoint, outward: BreachPoint): BreachFrontPiece[] => {
  const eps = 0.01;
  const centre = warp(base);
  const t = unit(add(warp(add(base, tangent, eps)), warp(add(base, tangent, -eps)), -1));
  let n = { x: -t.y, y: t.x };
  if (n.x * outward.x + n.y * outward.y < 0) n = { x: -n.x, y: -n.y };
  const foot = add(centre, n, LINE_WIDTH / 4);
  const tip = add(centre, n, LINE_WIDTH / 2 + TOOTH_HEIGHT);
  const startLit = -t.x * TOWARD_LIGHT.x - t.y * TOWARD_LIGHT.y > 0;
  return [
    { points: [add(foot, t, -TOOTH_HALF_BASE), foot, tip], shade: startLit ? 1 : SHADED },
    { points: [foot, add(foot, t, TOOTH_HALF_BASE), tip], shade: startLit ? SHADED : 1 }
  ];
};

/**
 * Front line for one open side of the pocket tile at world (worldX, worldY):
 * the side's own stretch, plus the rounded corner at its START (each corner
 * is the start of exactly one side, so every curve is drawn once). Teeth only
 * when `withTeeth` (the side faces my land).
 */
export const organicSideFront = (
  side: FrontSide,
  withTeeth: boolean,
  worldX: number,
  worldY: number,
  kindAt: (dx: number, dy: number) => FrontNeighbourKind
): BreachFrontPiece[] => {
  const warp = warpAt(worldX, worldY);
  const out = { x: side.dx, y: side.dy };
  const at = (u: number): BreachPoint => add(side.a, side.t, u);
  const startTurn = cornerTurn(side, -1, kindAt);
  const endTurn = cornerTurn(side, 1, kindAt);
  const u0 = startTurn === "straight" ? 0 : CORNER_RADIUS;
  const u1 = endTurn === "straight" ? 1 : 1 - CORNER_RADIUS;

  const path: BreachPoint[] = [];
  let arcTooth: BreachFrontPiece[] = [];
  if (startTurn !== "straight") {
    // The previous side runs into this corner along tPrev: turned one way round an outer corner, the other round an inner one.
    const tPrev = startTurn === "outer" ? { x: side.t.y, y: -side.t.x } : { x: -side.t.y, y: side.t.x };
    const from = add(side.a, tPrev, -CORNER_RADIUS);
    const centre = add(add(side.a, side.t, CORNER_RADIUS), tPrev, -CORNER_RADIUS);
    const arc = quarterArc(centre, from, at(u0));
    path.push(...arc.slice(0, -1));
    // Outer corners carry a tooth at the middle of the curve, pointing away from its centre (out of the pocket).
    // Only when the previous side (outward = tPrev turned a quarter) faces my land too.
    if (startTurn === "outer" && withTeeth && kindAt(tPrev.y, -tPrev.x) === "mine") {
      const mid = arc[ARC_STEPS / 2]!;
      arcTooth = tooth(warp, mid, unit({ x: arc[ARC_STEPS / 2 + 1]!.x - arc[ARC_STEPS / 2 - 1]!.x, y: arc[ARC_STEPS / 2 + 1]!.y - arc[ARC_STEPS / 2 - 1]!.y }), add(mid, centre, -1));
    }
  }
  const steps = Math.max(2, Math.round((u1 - u0) * STRAIGHT_STEPS));
  for (let i = 0; i <= steps; i += 1) path.push(at(u0 + ((u1 - u0) * i) / steps));

  const pieces = strip(path.map(warp));
  if (!withTeeth) return pieces;
  pieces.push(...arcTooth);
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    const u = (i + 0.5) / TEETH_PER_SIDE;
    // Teeth on the straight stretch only; the rounded corners handle their own.
    if (u < u0 || u > u1) continue;
    pieces.push(...tooth(warp, at(u), side.t, out));
  }
  return pieces;
};
