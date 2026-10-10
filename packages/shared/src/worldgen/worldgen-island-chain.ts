// v10+ archipelago island chains, split out of worldgen-archipelago-features.ts.
// Pre-v10 "archipelago zones" were a disk of up to 22 perfectly round islands,
// 6-20 tiles across, dropped in open ocean -- they read as scattered blobs,
// not an archipelago. Real archipelagos are either island arcs running
// parallel to a continental margin (Japan, the Aleutians, the Lesser
// Antilles) or shelf archipelagos just off a coast (the Aegean, the
// Philippines), and their islands are elongated and irregular, lined up
// along the chain. So a chain here is a gently curved arc laid parallel to
// the nearby coast, with islands strung along it:
//   - each island elongated (1.6-3x longer than wide) and aligned with the arc;
//   - an irregular outline from low-order wobble, a flat-ish top so the whole
//     island clears sea level instead of only its centre;
//   - sizes from small islets to the odd ~12-tile main island.
// Placement (which sea, which direction) lives in the caller; this module
// only lays out and shapes islands relative to the chain's centre.
import { seeded01 } from "./worldgen-noise.js";

const TAU = Math.PI * 2;

export type ChainIsland = {
  cx: number;
  cy: number;
  angle: number;
  halfLength: number;
  halfWidth: number;
  phases: readonly [number, number, number];
};

const CHAIN_HALF_SPAN_MIN = 22;
const CHAIN_HALF_SPAN_SPREAD = 18;
const ISLAND_STEP_MIN = 5;
const ISLAND_STEP_SPREAD = 5;
const ISLAND_HALF_LENGTH_MIN = 2;
const ISLAND_HALF_LENGTH_SPREAD = 4;
// Bounds every island's reach from the chain centre, for cheap rejects.
export const CHAIN_REACH = CHAIN_HALF_SPAN_MIN + CHAIN_HALF_SPAN_SPREAD + 12;

// Islands along an arc through (cx, cy) with tangent `direction`, bending to
// one side by up to ~10 tiles at its ends.
export const layOutIslandChain = (key: number, seed: number, cx: number, cy: number, direction: number): ChainIsland[] => {
  const r = (salt: number, sub = 0): number => seeded01(key * 100 + sub, salt, seed + 451001);
  const halfSpan = CHAIN_HALF_SPAN_MIN + r(1) * CHAIN_HALF_SPAN_SPREAD;
  const bend = (r(2) - 0.5) * 20 / (halfSpan * halfSpan);
  const tx = Math.cos(direction);
  const ty = Math.sin(direction);
  const islands: ChainIsland[] = [];
  let s = -halfSpan;
  for (let i = 0; s <= halfSpan; i += 1) {
    const offAxis = bend * s * s + (r(3, i) - 0.5) * 6;
    // Bigger islands toward the middle of the chain, islets at its ends.
    const centrality = 1 - Math.abs(s) / halfSpan;
    const halfLength = ISLAND_HALF_LENGTH_MIN + r(4, i) * ISLAND_HALF_LENGTH_SPREAD * (0.4 + 0.6 * centrality);
    const slope = 2 * bend * s; // arc tangent turns along the chain
    islands.push({
      cx: cx + tx * s - ty * offAxis,
      cy: cy + ty * s + tx * offAxis,
      angle: direction + Math.atan(slope) + (r(5, i) - 0.5) * 0.7,
      halfLength,
      halfWidth: halfLength / (1.6 + r(6, i) * 1.4),
      phases: [r(7, i) * TAU, r(8, i) * TAU, r(9, i) * TAU],
    });
    s += ISLAND_STEP_MIN + r(10, i) * ISLAND_STEP_SPREAD + halfLength;
  }
  return islands;
};

// Elevation bump at offset (dx, dy) from an island's centre.
export const chainIslandBump = (dx: number, dy: number, island: ChainIsland, height: number): number => {
  const reach = island.halfLength * 1.3 + 1;
  if (Math.abs(dx) > reach || Math.abs(dy) > reach) return 0;
  const c = Math.cos(island.angle);
  const s = Math.sin(island.angle);
  const u = (dx * c + dy * s) / island.halfLength;
  const v = (-dx * s + dy * c) / island.halfWidth;
  const e = Math.hypot(u, v);
  const theta = Math.atan2(v, u);
  const [p1, p2, p3] = island.phases;
  const outline = 1 + 0.18 * Math.sin(2 * theta + p1) + 0.12 * Math.sin(3 * theta + p2) + 0.08 * Math.sin(5 * theta + p3);
  const t = Math.max(0, Math.min(1, (outline - e) * 3));
  return height * t;
};
