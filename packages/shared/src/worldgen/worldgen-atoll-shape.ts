// v10+ natural atoll shape, split out of worldgen-archipelago-features.ts.
// Pre-v10 atolls were a perfect annulus: one radius all the way round, a
// constant 3.5-tile band of land and an evenly round lagoon -- it read as a
// drawn circle. Real atolls (the Maldives, Tuamotus, Marshall Islands) are
// irregular, often elongated rings broken into separate reef islets (motus),
// with passes through the reef into the lagoon. Each atoll here gets its own
// seeded shape:
//   - an elongated, rotated outline with low-order wobble (no two alike);
//   - a reef band whose width varies around the ring;
//   - the band broken into islets by a periodic mask around the ring;
//   - one or two guaranteed passes into the lagoon.
// All of it is a pure function of the atoll's seeded shape and the offset
// from its centre, so the ring stays an additive elevation bump like before.
import { seeded01 } from "./worldgen-noise.js";

const TAU = Math.PI * 2;

export type AtollShape = {
  /** Long-axis / short-axis ratio (the short axis is the rotated u), 1 = round. */
  aspect: number;
  angle: number;
  outlinePhases: readonly [number, number, number];
  widthPhase: number;
  isletFrequencies: readonly [number, number];
  isletPhases: readonly [number, number];
  /** Centre angles of the reef passes into the lagoon. */
  passes: readonly number[];
};

const ASPECT_MAX_EXTRA = 0.5; // aspect 1.0-1.5
const PASS_HALF_WIDTH = (11 * Math.PI) / 180;

export const naturalAtollShape = (key: number, seed: number): AtollShape => {
  const r = (salt: number): number => seeded01(key, salt, seed + 391001);
  const firstPass = r(10) * TAU;
  return {
    aspect: 1 + r(1) * ASPECT_MAX_EXTRA,
    angle: r(2) * Math.PI,
    outlinePhases: [r(3) * TAU, r(4) * TAU, r(5) * TAU],
    widthPhase: r(6) * TAU,
    // Few, chunky islets: each must clear the tiny-island prune (6+ tiles).
    isletFrequencies: [3 + Math.floor(r(7) * 2), 6 + Math.floor(r(8) * 2)],
    isletPhases: [r(9) * TAU, r(11) * TAU],
    // Half of atolls get a second pass, roughly opposite the first.
    passes: r(12) < 0.5 ? [firstPass] : [firstPass, firstPass + Math.PI + (r(13) - 0.5) * 1.2],
  };
};

const angleDelta = (a: number, b: number): number => {
  let d = Math.abs(a - b) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
};

// Elevation bump at offset (dx, dy) from an atoll centre: positive on the
// reef islets, lagoonDepth inside the ring, 0 in passes, gaps and open sea.
export const naturalAtollBump = (
  dx: number, dy: number, outerRadius: number, shape: AtollShape, ringHeight: number, lagoonDepth: number
): number => {
  const reach = outerRadius * 1.25 + 2;
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return 0;
  const c = Math.cos(shape.angle);
  const s = Math.sin(shape.angle);
  // Elongate by squashing the short axis, so the long axis stays at
  // outerRadius and an atoll never grows past its nominal size.
  const u = (dx * c + dy * s) * shape.aspect;
  const v = -dx * s + dy * c;
  const d = Math.hypot(u, v);
  const theta = Math.atan2(v, u);
  const [p1, p2, p3] = shape.outlinePhases;
  const outline =
    outerRadius * (1 + 0.1 * Math.sin(2 * theta + p1) + 0.07 * Math.sin(3 * theta + p2) + 0.05 * Math.sin(5 * theta + p3));
  if (d > outline + 1) return 0;
  const width = Math.max(2.8, outerRadius * 0.55) * (1 + 0.2 * Math.sin(3 * theta + shape.widthPhase));
  const inner = outline - width;
  if (d < inner) return lagoonDepth;
  // Flat-topped reef: at a few tiles across, a peaked profile only lifts the
  // band's midline above sea level -- a 1-tile thread that coastal smoothing
  // and the tiny-island prune then erase. Land fills the whole band instead.
  const half = width / 2;
  const t = Math.min(1, Math.max(0, 1 - Math.abs(d - (inner + half)) / half) * 4);
  if (shape.passes.some((p) => angleDelta(theta, p) < PASS_HALF_WIDTH)) return 0;
  const [k1, k2] = shape.isletFrequencies;
  const [q1, q2] = shape.isletPhases;
  const mask = Math.sin(k1 * theta + q1) + 0.4 * Math.sin(k2 * theta + q2);
  // Sharp islet edges: a half-faded reef rasterises into 1-tile slivers.
  const islet = Math.max(0, Math.min(1, (mask + 0.6) / 0.2));
  return ringHeight * t * islet;
};
