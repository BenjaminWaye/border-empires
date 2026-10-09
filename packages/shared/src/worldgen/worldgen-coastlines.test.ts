// Regression coverage for v10 coastlines (worldgen-continent-shelf.ts): plate
// edges used to be elevation cliffs, so coasts traced straight Voronoi
// boundaries with little detail. v10 adds a continental shelf, wandering
// boundaries, continuous roughness, fine coast detail and a fine sample
// displacement that keeps even steep strait walls from running straight.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { POLAR_BAND, setWorldSeed, terrainCodeAt, TERRAIN_LAND, TERRAIN_MOUNTAIN } from "./worldgen.js";

const PRE_FIX_VERSION = 9;
const FIX_VERSION = 10;

type CoastMap = { isLand: (x: number, y: number) => boolean; coast: Set<number>; land: number };

const coastMap = (seed: number, version: number): CoastMap => {
  setWorldSeed(seed, "continents", version);
  const isLand = (x: number, y: number): boolean => {
    if (y < 0 || y >= WORLD_HEIGHT) return true;
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
  return { isLand, coast, land };
};

// Whether the coast tiles in the 15x15 window around (x, y) lie on a
// near-perfect line (perpendicular spread under 0.6 tiles).
const isStraightAt = (coast: Set<number>, x: number, y: number): boolean => {
  const pts: Array<[number, number]> = [];
  for (let dy = -7; dy <= 7; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      if (coast.has((y + dy) * WORLD_WIDTH + ((x + dx + WORLD_WIDTH) % WORLD_WIDTH))) pts.push([dx, dy]);
    }
  }
  if (pts.length < 10) return false;
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
  return Math.sqrt(Math.max(0, minorVariance)) < 0.6;
};

const straightShare = (coast: Set<number>, tiles: Iterable<number>): number => {
  let total = 0;
  let straight = 0;
  for (const idx of tiles) {
    total += 1;
    if (isStraightAt(coast, idx % WORLD_WIDTH, Math.floor(idx / WORLD_WIDTH))) straight += 1;
  }
  return straight / Math.max(1, total);
};

// Coast tiles facing a NARROW sea: looking out across the water in some
// direction, land comes back within 4-30 tiles -- strait and channel shores,
// as opposed to open-ocean coasts.
const STRAIT_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const straitCoastTiles = ({ isLand, coast }: CoastMap): number[] =>
  [...coast].filter((idx) => {
    const x = idx % WORLD_WIDTH;
    const y = Math.floor(idx / WORLD_WIDTH);
    return STRAIT_DIRS.some(([dx, dy]) => {
      if (isLand(x + dx, y + dy)) return false;
      for (let k = 2; k <= 30; k += 1) {
        const ny = y + dy * k;
        if (ny < POLAR_BAND || ny >= WORLD_HEIGHT - POLAR_BAND) return false;
        if (isLand(x + dx * k, ny)) return k >= 4;
      }
      return false;
    });
  });

describe("coastlines (v10)", () => {
  test("coasts are more indented and less often ruler-straight than v9", () => {
    for (const seed of [2024, 424242]) {
      const before = coastMap(seed, PRE_FIX_VERSION);
      const after = coastMap(seed, FIX_VERSION);
      const development = (m: CoastMap): number => m.coast.size / Math.sqrt(Math.max(1, m.land));
      // Measured: 2024 24.6 -> 30.6, 424242 20.2 -> 31.6.
      expect(development(after)).toBeGreaterThan(development(before) * 1.1);
      // Measured: 2024 22% -> 9%, 424242 19% -> 10%.
      expect(straightShare(after.coast, after.coast)).toBeLessThan(straightShare(before.coast, before.coast) * 0.75);
    }
  }, 180_000);

  test("strait walls between continents are not ruler-straight", () => {
    // Seed 777777's eastern strait ran dead straight for ~190 tiles; 25% of
    // its strait coast was straight before the fine sample displacement, 15%
    // after.
    const map = coastMap(777777, FIX_VERSION);
    const strait = straitCoastTiles(map);
    expect(strait.length).toBeGreaterThan(1000);
    expect(straightShare(map.coast, strait)).toBeLessThan(0.2);
  }, 120_000);
});
