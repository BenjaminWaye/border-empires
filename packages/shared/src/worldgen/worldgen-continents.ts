// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit — same pattern as worldgen-hills.ts /
// worldgen-mountain-rings.ts. Pure seed generators for the continent/island
// ellipses that continentField() in worldgen.ts scores every tile against;
// no dependency on terrain state, so this has no circular-import concerns.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { POLAR_BAND, TAU, seeded01, worldSeed } from "./worldgen.js";

export type ContinentSeed = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  wobble: number;
  lobeA: number;
  lobeB: number;
  coastSeed: number;
};

export const buildContinents = (): ContinentSeed[] => {
  const seed = worldSeed();
  const scaleX = WORLD_WIDTH / 1000;
  const scaleY = WORLD_HEIGHT / 1000;
  const s = (v: number, axis: "x" | "y"): number => Math.max(24, Math.floor(v * (axis === "x" ? scaleX : scaleY)));
  // Five continents in a quincunx (NW, NE, center, SW, SE) so all map quadrants get land.
  // Each has seeded X (±s(130,"x")≈±29 tiles) and Y (±s(88,"y")≈±19 tiles) variation.
  // so = seed offset base; all params for one continent share a 7-slot range above it.
  // Corner X moved inward (0.20/0.70 vs 0.15/0.75) and rx increased to close ocean gaps.
  const layouts: Array<{ bx: number; by: number; so: number }> = [
    { bx: 0.20, by: 0.18, so: 101 }, // NW
    { bx: 0.70, by: 0.18, so: 141 }, // NE
    { bx: 0.45, by: 0.50, so: 181 }, // Center
    { bx: 0.20, by: 0.82, so: 221 }, // SW
    { bx: 0.70, by: 0.82, so: 261 }, // SE
  ];
  return layouts.map(({ bx, by, so }) => ({
    cx:        Math.floor(WORLD_WIDTH  * bx + (seeded01(11, 13, seed + so)     - 0.5) * s(130, "x")),
    cy:        Math.floor(WORLD_HEIGHT * by + (seeded01(17, 19, seed + so + 1) - 0.5) * s(88,  "y")),
    rx:        s(165 + Math.floor(seeded01(23, 29, seed + so + 2) * 24), "x"),
    ry:        s(233 + Math.floor(seeded01(31, 37, seed + so + 3) * 28), "y"),
    wobble:    seeded01(41, 43, seed + so + 4) * TAU,
    lobeA:     seeded01(47, 53, seed + so + 5) * TAU,
    lobeB:     seeded01(59, 61, seed + so + 6) * TAU,
    coastSeed: seed + so + 200,
  }));
};

export const buildIslands = (): ContinentSeed[] => {
  const seed = worldSeed();
  // A handful of large islands (so the map always has room for one big
  // landmass to settle on) plus ~50 small island blobs scattered around
  // them. The existing max-score ellipse system creates irregular shapes;
  // small rx/ry keeps each small island distinct, while the big-island
  // radii below are sized similarly to a single lobe of a "continents"-style
  // landmass.
  const BIG_ISLAND_COUNT = 4;
  const SMALL_ISLAND_COUNT = 50;
  const out: ContinentSeed[] = [];
  for (let i = 0; i < BIG_ISLAND_COUNT; i++) {
    const cx = Math.floor(seeded01(i, 0, seed + 5000 + i) * WORLD_WIDTH);
    const cy = Math.floor(POLAR_BAND + 15 + seeded01(i, 1, seed + 6000 + i) * (WORLD_HEIGHT - 2 * POLAR_BAND - 30));
    const r  = 55 + Math.floor(seeded01(i, 2, seed + 7000 + i) * 45); // radius 55–99
    out.push({
      cx, cy,
      rx: r,
      ry: r + Math.floor(seeded01(i, 3, seed + 8000 + i) * 20) - 10,
      wobble:    seeded01(i, 4, seed + 9000 + i) * TAU,
      lobeA:     seeded01(i, 5, seed + 9500 + i) * TAU,
      lobeB:     seeded01(i, 6, seed + 9800 + i) * TAU,
      coastSeed: seed + 9900 + i
    });
  }
  for (let i = 0; i < SMALL_ISLAND_COUNT; i++) {
    const cx = Math.floor(seeded01(i, 0, seed + 10000 + i) * WORLD_WIDTH);
    const cy = Math.floor(POLAR_BAND + 10 + seeded01(i, 1, seed + 20000 + i) * (WORLD_HEIGHT - 2 * POLAR_BAND - 20));
    const r  = 7 + Math.floor(seeded01(i, 2, seed + 30000 + i) * 15); // radius 7–22
    out.push({
      cx, cy,
      rx: r,
      ry: r + Math.floor(seeded01(i, 3, seed + 40000 + i) * 6),
      wobble:    seeded01(i, 4, seed + 50000 + i) * TAU,
      lobeA:     seeded01(i, 5, seed + 60000 + i) * TAU,
      lobeB:     seeded01(i, 6, seed + 70000 + i) * TAU,
      coastSeed: seed + 80000 + i
    });
  }
  return out;
};
