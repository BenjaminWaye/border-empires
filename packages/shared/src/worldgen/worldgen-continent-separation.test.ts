// Regression coverage for v10 continent separation (worldgen-plates.ts /
// worldgen-continent-score.ts): continents style used to fuse neighbouring
// continent clusters -- and land bridges raised on oceanic plates -- into one
// supercontinent holding 80-100% of all land on many seeds.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { buildPlates } from "./worldgen-plates.js";
import { POLAR_BAND, setWorldSeed, terrainCodeAt, TERRAIN_LAND, TERRAIN_MOUNTAIN } from "./worldgen.js";

const PRE_FIX_VERSION = 9;
const FIX_VERSION = 10;

// Share of all (non-polar) land held by the single largest 4-connected
// landmass, wrapping in x. Polar rows are mountain/ice everywhere, so they
// would join every landmass that reaches them; they are left out.
const largestLandmassShare = (seed: number, version: number): number => {
  setWorldSeed(seed, "continents", version);
  const land = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  let landTotal = 0;
  for (let y = POLAR_BAND; y < WORLD_HEIGHT - POLAR_BAND; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const t = terrainCodeAt(x, y);
      if (t === TERRAIN_LAND || t === TERRAIN_MOUNTAIN) {
        land[y * WORLD_WIDTH + x] = 1;
        landTotal += 1;
      }
    }
  }
  const seen = new Uint8Array(land.length);
  let largest = 0;
  for (let start = 0; start < land.length; start += 1) {
    if (!land[start] || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    let size = 0;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      size += 1;
      const cx = cur % WORLD_WIDTH;
      const cy = Math.floor(cur / WORLD_WIDTH);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ny = cy + dy;
        if (ny < 0 || ny >= WORLD_HEIGHT) continue;
        const next = ny * WORLD_WIDTH + ((cx + dx + WORLD_WIDTH) % WORLD_WIDTH);
        if (land[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest / Math.max(1, landTotal);
};

describe("continent separation (v10)", () => {
  test("a seed that was one supercontinent now splits into several continents", () => {
    // Seed 777777: one landmass held ~94% of all land under v9.
    expect(largestLandmassShare(777777, PRE_FIX_VERSION)).toBeGreaterThan(0.85);
    expect(largestLandmassShare(777777, FIX_VERSION)).toBeLessThan(0.55);
  }, 120_000);

  test("continental plates cover enough of the map that the land target never needs oceanic plates", () => {
    for (const seed of [11, 202, 777777]) {
      setWorldSeed(seed, "continents", FIX_VERSION);
      const plates = buildPlates();
      const continental = plates.filter((p) => p.isContinental);
      // The radius-only rule gave ~6 of 16 (and as few as 3); the area rule
      // must reach well past that to cover the 45% land target plus margin.
      expect(continental.length).toBeGreaterThanOrEqual(8);
      expect(plates.filter((p) => !p.isContinental).every((p) => p.clusterId === -1)).toBe(true);
    }
  });

  test("worlds stamped with the pre-fix version keep their old continental plates", () => {
    setWorldSeed(202, "continents", PRE_FIX_VERSION);
    // Seed 202 had only 3 continental plates under the radius rule.
    expect(buildPlates().filter((p) => p.isContinental)).toHaveLength(3);
  });
});
