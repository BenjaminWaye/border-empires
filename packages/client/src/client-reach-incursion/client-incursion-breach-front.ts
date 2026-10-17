// The spikes-style front line around one incursion tile (see
// client-incursion-breach-layout.ts), after Hearts of Iron IV: one flat shape
// in the attacker's colour -- a thin line with small, widely spaced teeth
// standing on it, with a very thin contrasting outline -- drawn organically
// rather than ruled along the tile grid:
//   - corners where the boundary turns stay square: the two stretches meet
//     under a square cap, as on a map symbol;
//   - every point is pushed by a smooth noise field sampled in WORLD space,
//     so the line meanders gently, and since a shared world point always
//     moves the same way, neighbouring tiles' pieces still meet exactly;
//   - teeth follow the line's normal (none crowding into an inside corner);
//   - drawn like an inked campaign map: the stroke swells and thins along the
//     front (calligraphic), teeth are tall, even, straight-sided triangles,
//     and where the front meets the old border the stroke tapers to a point
//     instead of stopping bluntly.
// Pure + renderer-agnostic: convex polygons in tile-local space (the tile
// spans [-0.5, 0.5] on both axes, +x east, +y south = scene +z).

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

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

const LINE_WIDTH = 0.048;
/** Calligraphic swell: the stroke's width varies by up to this fraction along the front (world-space, so seamless). */
const LINE_SWELL = 0.5;
const LINE_SWELL_FREQUENCY = 2.3;
/** Path length (tiles) over which the stroke tapers to a point where the front meets the old border. */
const BORDER_TAPER = 0.3;
/** Teeth: tall isosceles triangles, all the same size, evenly spaced (so the spacing runs on unbroken across tiles). */
const TEETH_PER_SIDE = 4;
const TOOTH_HEIGHT = 0.27;
const TOOTH_HALF_BASE = 0.055;
/** Outline thickness, in tiles. */
const OUTLINE_WIDTH = 0.011;
/** Meander: how far (in tiles) and how broadly (noise cells per tile) the line wanders. */
const WARP_AMPLITUDE = 0.075;
const WARP_FREQUENCY = 0.85;
const STRAIGHT_STEPS = 8;

const fract = (v: number): number => v - Math.floor(v);
const lattice = (ix: number, iy: number, seed: number): number => fract(Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453);
const smooth = (t: number): number => t * t * (3 - 2 * t);

const wrapIndex = (i: number, period: number): number => ((i % period) + period) % period;

/**
 * Smooth 2D value noise in [-1, 1] over WORLD coordinates, at roughly
 * `frequency` cells per tile -- snapped to a whole number of cells across the
 * world and wrapped, so the field is seamless where the toroidal map wraps
 * (a tile at the last column and one at column 0 see the same values at
 * their shared edge).
 */
const worldNoise = (worldX: number, worldY: number, frequency: number, seed: number): number => {
  const periodX = Math.max(1, Math.round(WORLD_WIDTH * frequency));
  const periodY = Math.max(1, Math.round(WORLD_HEIGHT * frequency));
  const x = (worldX * periodX) / WORLD_WIDTH;
  const y = (worldY * periodY) / WORLD_HEIGHT;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = smooth(x - ix);
  const v = smooth(y - iy);
  const at = (cx: number, cy: number): number => lattice(wrapIndex(cx, periodX), wrapIndex(cy, periodY), seed);
  const top = at(ix, iy) * (1 - u) + at(ix + 1, iy) * u;
  const bottom = at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u;
  return (top * (1 - v) + bottom * v) * 2 - 1;
};

/** Pushes a tile-local point by the world-space meander field. Same world point in, same offset out. */
const warpAt =
  (worldX: number, worldY: number) =>
  (p: BreachPoint): BreachPoint => ({
    x: p.x + worldNoise(worldX + p.x, worldY + p.y, WARP_FREQUENCY, 1) * WARP_AMPLITUDE,
    y: p.y + worldNoise(worldX + p.x, worldY + p.y, WARP_FREQUENCY, 2) * WARP_AMPLITUDE
  });

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
    (LINE_WIDTH / 2) * (1 + LINE_SWELL * worldNoise(worldX + p.x, worldY + p.y, LINE_SWELL_FREQUENCY, 3));

/**
 * A tall triangular tooth standing on the warped curve at `base`, pointing
 * along the curve normal on the `outward` side. Drawn as a fan from its root
 * centre (on the line), with the rim as the same fan over the triangle's
 * corners pushed out by OUTLINE_WIDTH (mitred, capped at the sharp tip).
 */
const tooth = (warp: (p: BreachPoint) => BreachPoint, base: BreachPoint, tangent: BreachPoint, outward: BreachPoint): BreachFrontPiece[] => {
  const eps = 0.01;
  const centre = warp(base);
  const t = unit(add(warp(add(base, tangent, eps)), warp(add(base, tangent, -eps)), -1));
  let n = { x: -t.y, y: t.x };
  if (n.x * outward.x + n.y * outward.y < 0) n = { x: -n.x, y: -n.y };
  const boundary = [add(centre, t, -TOOTH_HALF_BASE), add(centre, n, LINE_WIDTH / 2 + TOOTH_HEIGHT), add(centre, t, TOOTH_HALF_BASE)];
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
 * the side's own stretch, corner to corner, plus a square cap on the corner at
 * its START if the boundary turns there (each corner is the start of exactly
 * one side, so every cap is drawn once). Teeth only when `withTeeth` (the side
 * faces my land).
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
  const turns = (turn: CornerTurn): boolean => turn === "outer" || turn === "inner";

  const path: BreachPoint[] = [];
  for (let i = 0; i <= STRAIGHT_STEPS; i += 1) path.push(at(i / STRAIGHT_STEPS));

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
  if (turns(startTurn)) {
    // Square cap over the corner, aligned with this stretch, sized to the
    // stroke there (the same world point for both stretches, so it fits both).
    const centre = warp(side.a);
    const t = unit(add(warp(at(0.01)), warp(at(-0.01)), -1));
    const n = { x: -t.y, y: t.x };
    const square = (h: number): BreachPoint[] => [add(add(centre, t, -h), n, -h), add(add(centre, t, h), n, -h), add(add(centre, t, h), n, h), add(add(centre, t, -h), n, h)];
    const h = swell(side.a);
    pieces.push({ points: square(h), outline: square(h + OUTLINE_WIDTH) });
  }
  if (!withTeeth) return pieces;
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    // At an inside corner the neighbouring stretch's end tooth points into the
    // same tile of mine, so drop the end teeth there or the two cross.
    if ((i === 0 && startTurn === "inner") || (i === TEETH_PER_SIDE - 1 && endTurn === "inner")) continue;
    pieces.push(...tooth(warp, at((i + 0.5) / TEETH_PER_SIDE), side.t, out));
  }
  return pieces;
};
