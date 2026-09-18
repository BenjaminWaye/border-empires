// Split out of worldgen.ts (already at the repo's 500-line file cap) so this
// didn't push that file over the limit — same pattern as worldgen-hills.ts /
// worldgen-mountain-rings.ts. Pure seed generator for the island ellipses
// that worldgen-continent-score.ts scores every tile against under the
// islands WorldStyle; no dependency on terrain state, so this has no
// circular-import concerns. Continents style uses tectonic plates instead
// (worldgen-plates.ts) -- this file used to also build the 5 big-continent
// ellipse seeds (buildContinents), retired once plates took over that job.
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
  // Low-order (1-fold/2-fold) angle harmonics, used only for the big
  // landmasses: real continents (South America's taper, Italy's boot,
  // Florida's peninsula) get their character from ONE dominant asymmetric
  // bulge-and-taper, not from the higher-fold (3/5/7) symmetric lobes below,
  // which only add coastline complexity on top of that base shape.
  taperPhase: number;
  bulgePhase: number;
  coastSeed: number;
};

// Fraction of small islands left uniformly scattered across the whole map
// (remote/open-ocean islands) rather than clustered near a big island's
// coastline. The rest are placed just outside a big island's radius so the
// map reads as "islands clinging to the mainland" rather than uniform noise.
const REMOTE_SMALL_ISLAND_FRACTION = 0.2;

export const buildIslands = (): ContinentSeed[] => {
  const seed = worldSeed();
  // A handful of large islands (so the map always has room for one big
  // landmass to settle on) plus ~50 small island blobs, most clustered near
  // the big islands' coastlines and a remaining fraction scattered remotely.
  // The existing max-score ellipse system creates irregular shapes; small
  // rx/ry keeps each small island distinct, while the big-island radii below
  // are sized similarly to a single lobe of a "continents"-style landmass.
  const BIG_ISLAND_COUNT = 5;
  const SMALL_ISLAND_COUNT = 55;
  const out: ContinentSeed[] = [];
  const bigIslands: Array<{ cx: number; cy: number; r: number }> = [];
  for (let i = 0; i < BIG_ISLAND_COUNT; i++) {
    const cx = Math.floor(seeded01(i, 0, seed + 5000 + i) * WORLD_WIDTH);
    const cy = Math.floor(POLAR_BAND + 15 + seeded01(i, 1, seed + 6000 + i) * (WORLD_HEIGHT - 2 * POLAR_BAND - 30));
    const r  = 65 + Math.floor(seeded01(i, 2, seed + 7000 + i) * 55); // radius 65–119
    bigIslands.push({ cx, cy, r });
    out.push({
      cx, cy,
      rx: r,
      ry: r + Math.floor(seeded01(i, 3, seed + 8000 + i) * 20) - 10,
      wobble:    seeded01(i, 4, seed + 9000 + i) * TAU,
      lobeA:     seeded01(i, 5, seed + 9500 + i) * TAU,
      lobeB:     seeded01(i, 6, seed + 9800 + i) * TAU,
      taperPhase: seeded01(i, 11, seed + 9910 + i) * TAU,
      bulgePhase: seeded01(i, 12, seed + 9920 + i) * TAU,
      coastSeed: seed + 9900 + i
    });
  }
  for (let i = 0; i < SMALL_ISLAND_COUNT; i++) {
    const isRemote = seeded01(i, 9, seed + 25000 + i) < REMOTE_SMALL_ISLAND_FRACTION;
    let cx: number;
    let cy: number;
    if (isRemote || bigIslands.length === 0) {
      cx = Math.floor(seeded01(i, 0, seed + 10000 + i) * WORLD_WIDTH);
      cy = Math.floor(POLAR_BAND + 10 + seeded01(i, 1, seed + 20000 + i) * (WORLD_HEIGHT - 2 * POLAR_BAND - 20));
    } else {
      const host = bigIslands[Math.floor(seeded01(i, 7, seed + 26000 + i) * bigIslands.length) % bigIslands.length]!;
      const angle = seeded01(i, 8, seed + 27000 + i) * TAU;
      // Just outside the host's coastline (1.0x-2.5x its radius) so the
      // small island clings near shore instead of sitting on the mainland.
      const distance = host.r * (1.0 + seeded01(i, 10, seed + 28000 + i) * 1.5);
      cx = Math.floor(host.cx + Math.cos(angle) * distance);
      cy = Math.floor(host.cy + Math.sin(angle) * distance);
    }
    const r  = 7 + Math.floor(seeded01(i, 2, seed + 30000 + i) * 15); // radius 7–22
    out.push({
      cx, cy,
      rx: r,
      ry: r + Math.floor(seeded01(i, 3, seed + 40000 + i) * 6),
      wobble:    seeded01(i, 4, seed + 50000 + i) * TAU,
      lobeA:     seeded01(i, 5, seed + 60000 + i) * TAU,
      lobeB:     seeded01(i, 6, seed + 70000 + i) * TAU,
      taperPhase: seeded01(i, 11, seed + 90000 + i) * TAU,
      bulgePhase: seeded01(i, 12, seed + 91000 + i) * TAU,
      coastSeed: seed + 80000 + i
    });
  }
  return out;
};
