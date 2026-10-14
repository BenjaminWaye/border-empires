// The spikes-style front line around one incursion tile (see
// client-incursion-breach-layout.ts), after Hearts of Iron IV: one flat shape
// in the attacker's colour -- a thin line with small, widely spaced teeth
// standing on it, with a very thin contrasting outline -- drawn ORGANICALLY
// rather than along the tile grid:
//   - corners where the boundary turns are rounded (outer corners curve
//     inside the pocket, inner corners curve out round my tile);
//   - every point is pushed by a smooth noise field sampled in WORLD space,
//     so the line meanders gently, and since a shared world point always
//     moves the same way, neighbouring tiles' pieces still meet exactly;
//   - teeth follow the curve's normal, with one on each rounded outer corner;
//   - drawn like an inked campaign map: the stroke swells and thins along the
//     front (calligraphic), teeth are shark fins whose concave flanks flow
//     out of the line, and where the front meets the old border the stroke
//     tapers to a point instead of stopping bluntly.
// Pure + renderer-agnostic: convex polygons in tile-local space (the tile
// spans [-0.5, 0.5] on both axes, +x east, +y south = scene +z).

export type BreachPoint = { readonly x: number; readonly y: number };

/**
 * One convex piece (a line segment or a tooth). `points` is drawn flat in the
 * attacker's colour; `outline` is the same polygon grown by a hair, drawn
 * underneath every fill in the outline colour, so the whole front reads as one
 * shape with a thin rim.
 */
export type BreachFrontPiece = { readonly points: readonly BreachPoint[]; readonly outline: readonly BreachPoint[] };

/**
 * What sits at offset (dx, dy) from the pocket tile: more of this incursion
 * pocket, the same rival's own land OUTSIDE my reach (behind the old border),
 * my land, or anything else.
 */
export type FrontNeighbourKind = "pocket" | "rival" | "mine" | "other";

/** One open side of the pocket tile: outward direction (dx, dy), its start corner, and its unit tangent (clockwise round the pocket). */
export type FrontSide = { readonly dx: number; readonly dy: number; readonly a: BreachPoint; readonly t: BreachPoint };

const LINE_WIDTH = 0.035;
/** Calligraphic swell: the stroke's width varies by up to this fraction along the front (world-space, so seamless). */
const LINE_SWELL = 0.4;
const LINE_SWELL_FREQUENCY = 2.3;
/** Path length (tiles) over which the stroke tapers to a point where the front meets the old border. */
const BORDER_TAPER = 0.3;
const TEETH_PER_SIDE = 3;
const TOOTH_HEIGHT = 0.17;
/** Shark-fin teeth: the root flares along the line to this half-width, the flanks curving in to the tip. */
const TOOTH_ROOT_HALF = 0.105;
const FLANK_STEPS = 4;
/** Outline thickness, in tiles. */
const OUTLINE_WIDTH = 0.011;
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

type CornerTurn = "straight" | "outer" | "inner" | "border";

/**
 * How the boundary continues past one end of a side: on along the next tile,
 * round an outer corner, round an inner one -- or into the rival's own land
 * behind the old border ("border"), where the front line simply ends, run
 * right up to the corner, since no incursion tile carries it on.
 */
const cornerTurn = (side: FrontSide, along: 1 | -1, kindAt: (dx: number, dy: number) => FrontNeighbourKind): CornerTurn => {
  const diagonal = kindAt(side.dx + side.t.x * along, side.dy + side.t.y * along);
  const next = kindAt(side.t.x * along, side.t.y * along);
  if (diagonal === "rival" || next === "rival") return "border";
  if (diagonal === "pocket") return "inner";
  return next === "pocket" ? "straight" : "outer";
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

/** Thick polyline with mitred joints (per-vertex averaged normals), each vertex at its own half-width, plus its rim. */
const strip = (pts: readonly BreachPoint[], halfWidths: readonly number[]): BreachFrontPiece[] => {
  const segNormals = pts.slice(1).map((q, i) => unit({ x: -(q.y - pts[i]!.y), y: q.x - pts[i]!.x }));
  const vertexNormal = (i: number): BreachPoint => unit(add(segNormals[Math.max(0, i - 1)]!, segNormals[Math.min(segNormals.length - 1, i)]!));
  return segNormals.map((_, i) => {
    const m0 = vertexNormal(i);
    const m1 = vertexNormal(i + 1);
    const quad = (h0: number, h1: number): BreachPoint[] => [add(pts[i]!, m0, h0), add(pts[i + 1]!, m1, h1), add(pts[i + 1]!, m1, -h1), add(pts[i]!, m0, -h0)];
    // The rim is the same strip widened on the shared vertex normals, so it stays one smooth band as the width swells.
    return { points: quad(halfWidths[i]!, halfWidths[i + 1]!), outline: quad(halfWidths[i]! + OUTLINE_WIDTH, halfWidths[i + 1]! + OUTLINE_WIDTH) };
  });
};

/** Half the stroke width at a tile-local point, swelling and thinning with a world-space noise field. */
const swellAt =
  (worldX: number, worldY: number) =>
  (p: BreachPoint): number =>
    (LINE_WIDTH / 2) * (1 + LINE_SWELL * noise((worldX + p.x) * LINE_SWELL_FREQUENCY, (worldY + p.y) * LINE_SWELL_FREQUENCY, 3));

const bezier = (a: BreachPoint, c: BreachPoint, b: BreachPoint, s: number): BreachPoint => ({
  x: (1 - s) * (1 - s) * a.x + 2 * s * (1 - s) * c.x + s * s * b.x,
  y: (1 - s) * (1 - s) * a.y + 2 * s * (1 - s) * c.y + s * s * b.y
});

/**
 * A shark-fin tooth standing on the warped curve at `base`, pointing along the
 * curve normal on the `outward` side: the root flares out along the line and
 * each flank sweeps in on a concave curve to a sharp tip. Star-shaped about
 * its root centre, so it's drawn as a fan of triangles from there -- and the
 * outline as the same fan over the boundary pushed out by OUTLINE_WIDTH.
 */
const tooth = (warp: (p: BreachPoint) => BreachPoint, base: BreachPoint, tangent: BreachPoint, outward: BreachPoint): BreachFrontPiece[] => {
  const eps = 0.01;
  const centre = warp(base);
  const t = unit(add(warp(add(base, tangent, eps)), warp(add(base, tangent, -eps)), -1));
  let n = { x: -t.y, y: t.x };
  if (n.x * outward.x + n.y * outward.y < 0) n = { x: -n.x, y: -n.y };
  const tip = add(centre, n, LINE_WIDTH / 2 + TOOTH_HEIGHT);
  const flank = (side: 1 | -1): BreachPoint[] => {
    const root = add(centre, t, TOOTH_ROOT_HALF * side);
    // Control point low and close to the axis: the flank leaves the line almost flat (a fillet), then rises to the tip.
    const control = add(add(centre, t, TOOTH_ROOT_HALF * 0.3 * side), n, LINE_WIDTH / 2 + TOOTH_HEIGHT * 0.12);
    return Array.from({ length: FLANK_STEPS + 1 }, (_, i) => bezier(root, control, tip, i / FLANK_STEPS));
  };
  const boundary = [...flank(-1), ...flank(1).reverse().slice(1)];
  // Push each boundary point out along its averaged outward normal (mitred, capped at the sharp tip).
  const edgeOut = (i: number): BreachPoint => {
    const p = boundary[i]!;
    const q = boundary[i + 1]!;
    const e = unit({ x: -(q.y - p.y), y: q.x - p.x });
    const mid = { x: (p.x + q.x) / 2 - centre.x, y: (p.y + q.y) / 2 - centre.y };
    return e.x * mid.x + e.y * mid.y >= 0 ? e : { x: -e.x, y: -e.y };
  };
  const rim = boundary.map((p, i) => {
    const a = edgeOut(Math.max(0, i - 1));
    const b = edgeOut(Math.min(boundary.length - 2, i));
    const m = unit(add(a, b));
    return add(p, m, OUTLINE_WIDTH / Math.max(0.35, m.x * a.x + m.y * a.y));
  });
  return boundary.slice(0, -1).map((p, i) => ({ points: [centre, p, boundary[i + 1]!], outline: [centre, rim[i]!, rim[i + 1]!] }));
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
  const runsToCorner = (turn: CornerTurn): boolean => turn === "straight" || turn === "border";
  const u0 = runsToCorner(startTurn) ? 0 : CORNER_RADIUS;
  const u1 = runsToCorner(endTurn) ? 1 : 1 - CORNER_RADIUS;

  const path: BreachPoint[] = [];
  let arcTooth: BreachFrontPiece[] = [];
  if (!runsToCorner(startTurn)) {
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

  // Stroke width: the world-space swell, tapering to a point over BORDER_TAPER at an end that meets the old border.
  const swell = swellAt(worldX, worldY);
  const along = path.map((_, i) => path.slice(1, i + 1).reduce((sum, p, k) => sum + Math.hypot(p.x - path[k]!.x, p.y - path[k]!.y), 0));
  const total = along[along.length - 1] ?? 0;
  const taper = (d: number): number => smooth(Math.min(1, d / BORDER_TAPER));
  const halfWidths = path.map((p, i) => {
    let w = swell(p);
    if (startTurn === "border") w *= taper(along[i]!);
    if (endTurn === "border") w *= taper(total - along[i]!);
    return w;
  });
  const pieces = strip(path.map(warp), halfWidths);
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
