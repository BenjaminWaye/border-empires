// Regression coverage for v10 coastlines (worldgen-continent-shelf.ts): plate
// edges used to be elevation cliffs, so coasts traced straight Voronoi
// boundaries with little detail. v10 adds a continental shelf, wandering
// boundaries, continuous roughness and fine coast detail.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { POLAR_BAND, setWorldSeed, terrainCodeAt, TERRAIN_LAND, TERRAIN_MOUNTAIN } from "./worldgen.js";

const PRE_FIX_VERSION = 9;
const FIX_VERSION = 10;

type CoastStats = {
  /** Coast tiles per sqrt(land tiles): a shoreline-development index (higher = more indented). */
  development: number;
  /** Share of coast tiles whose 15x15 neighbourhood of coast tiles lies on a near-perfect line. */
  straightShare: number;
};

const coastStats = (seed: number, version: number): CoastStats => {
  setWorldSeed(seed, "continents", version);
  const isLand = (x: number, y: number): boolean => {
    const t = terrainCodeAt((x + WORLD_WIDTH) % WORLD_WIDTH, y);
    return t === TERRAIN_LAND || t === TERRAIN_MOUNTAIN;
  };
  const coast = new Set<number>();
  let land = 0;
  for (let y = POLAR_BAND + 1; y < WORLD_HEIGHT - POLAR_BAND - 1; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (!isLand(x, y)) continue;
      land += 1;
      if (!isLand(x + 1, y) || !isLand(x - 1, y) || !isLand(x, y + 1) || !isLand(x, y - 1)) coast.add(y * WORLD_WIDTH + x);
    }
  }
  let straight = 0;
  for (const idx of coast) {
    const x = idx % WORLD_WIDTH;
    const y = Math.floor(idx / WORLD_WIDTH);
    const pts: Array<[number, number]> = [];
    for (let dy = -7; dy <= 7; dy += 1) {
      for (let dx = -7; dx <= 7; dx += 1) {
        if (coast.has((y + dy) * WORLD_WIDTH + ((x + dx + WORLD_WIDTH) % WORLD_WIDTH))) pts.push([dx, dy]);
      }
    }
    if (pts.length < 10) continue;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [px, py] of pts) {
      sxx += (px - mx) ** 2;
      sxy += (px - mx) * (py - my);
      syy += (py - my) ** 2;
    }
    const minorVariance = ((sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2)) / pts.length;
    if (Math.sqrt(Math.max(0, minorVariance)) < 0.6) straight += 1;
  }
  return { development: coast.size / Math.sqrt(Math.max(1, land)), straightShare: straight / Math.max(1, coast.size) };
};

describe("coastlines (v10)", () => {
  test("coasts are more indented and less often ruler-straight than v9", () => {
    for (const seed of [2024, 424242]) {
      const before = coastStats(seed, PRE_FIX_VERSION);
      const after = coastStats(seed, FIX_VERSION);
      // Measured: 2024 24.6 -> 28.4, 424242 20.2 -> 33.8.
      expect(after.development).toBeGreaterThan(before.development * 1.1);
      // Measured: 2024 22% -> 12%, 424242 19% -> 11%.
      expect(after.straightShare).toBeLessThan(before.straightShare * 0.75);
    }
  }, 180_000);
});
