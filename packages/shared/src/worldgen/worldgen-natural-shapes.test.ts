// Regression coverage for the v10 shape fixes: continents-style mountain
// ranges used to run ruler-straight along Voronoi plate boundaries (150+
// tiles) and fill wide solid wedges wherever the boundary flattened; now they
// are a thin (<= ~2 tile) wandering core wrapped in hills. Atolls were also
// stretched into ovals by the domain warp. See worldgen-natural-ranges.ts /
// worldgen-continent-score.ts.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { atollBumpAt } from "./worldgen-archipelago-features.js";
import { isHillsRegionAt } from "./worldgen-hills.js";
import { isMountainRange } from "./worldgen-mountain-ranges.js";
import { setWorldSeed, terrainCodeAt, TERRAIN_LAND, TERRAIN_MOUNTAIN } from "./worldgen.js";

const PRE_FIX_VERSION = 9;
const FIX_VERSION = 10;

type RangeStats = {
  tiles: number;
  lengthSum: number;
  longestRun: number;
  /** Range tiles whose 5x5 neighbourhood is more than half range -- i.e. part of a thick band. */
  thickTiles: number;
  /** Every range tile, including those in components too small to measure for length. */
  allTiles: number;
  /** Land tiles within 2 of a range tile, and how many of those are hills. */
  nearLand: number;
  nearHills: number;
};

// Connected components (8-neighbour, wrapping in x) of tiles the range rule
// actually turned into mountain terrain. A component's length is its extent
// along its principal axis, so a thick blob and a thin line of the same
// extent report the same length and differ only in tile count.
const rangeStats = (seed: number, version: number): RangeStats => {
  setWorldSeed(seed, "continents", version);
  const mask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (isMountainRange(x, y) && terrainCodeAt(x, y) === TERRAIN_MOUNTAIN) mask[y * WORLD_WIDTH + x] = 1;
    }
  }
  const stats_ = { thickTiles: 0, allTiles: 0, nearLand: 0, nearHills: 0 };
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (!mask[y * WORLD_WIDTH + x]) continue;
      stats_.allTiles += 1;
      let rangeNeighbours = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= WORLD_HEIGHT) continue;
          const nx = (x + dx + WORLD_WIDTH) % WORLD_WIDTH;
          if (mask[ny * WORLD_WIDTH + nx]) rangeNeighbours += 1;
          if (terrainCodeAt(nx, ny) === TERRAIN_LAND) {
            stats_.nearLand += 1;
            if (isHillsRegionAt(nx, ny)) stats_.nearHills += 1;
          }
        }
      }
      if (rangeNeighbours >= 13) stats_.thickTiles += 1;
    }
  }
  const seen = new Uint8Array(mask.length);
  const stats: RangeStats = { tiles: 0, lengthSum: 0, longestRun: 0, ...stats_ };
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    const points: Array<[number, number]> = [];
    const x0 = start % WORLD_WIDTH;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const cx = cur % WORLD_WIDTH;
      const cy = Math.floor(cur / WORLD_WIDTH);
      // Unwrap x relative to the start tile so a range crossing the seam
      // measures as one continuous shape.
      points.push([((cx - x0 + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2, cy]);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= WORLD_HEIGHT) continue;
          const next = ny * WORLD_WIDTH + ((cx + dx + WORLD_WIDTH) % WORLD_WIDTH);
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (points.length < 60) continue;
    const meanX = points.reduce((s, p) => s + p[0], 0) / points.length;
    const meanY = points.reduce((s, p) => s + p[1], 0) / points.length;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const [px, py] of points) {
      sxx += (px - meanX) ** 2;
      sxy += (px - meanX) * (py - meanY);
      syy += (py - meanY) ** 2;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [px, py] of points) {
      const along = (px - meanX) * Math.cos(theta) + (py - meanY) * Math.sin(theta);
      lo = Math.min(lo, along);
      hi = Math.max(hi, along);
    }
    stats.tiles += points.length;
    stats.lengthSum += hi - lo;
    stats.longestRun = Math.max(stats.longestRun, hi - lo);
  }
  return stats;
};

describe("continents mountain ranges (v10)", () => {
  test("mountains stay a thin core with hills around them, unlike the v9 wedges and hairlines", () => {
    const seeds = [424242];
    const before = seeds.map((seed) => rangeStats(seed, PRE_FIX_VERSION));
    const after = seeds.map((seed) => rangeStats(seed, FIX_VERSION));
    const sum = (all: RangeStats[], pick: (r: RangeStats) => number): number => all.reduce((s, r) => s + pick(r), 0);
    const thickShare = (all: RangeStats[]): number => sum(all, (r) => r.thickTiles) / sum(all, (r) => r.allTiles);
    const hillShare = (all: RangeStats[]): number => sum(all, (r) => r.nearHills) / sum(all, (r) => r.nearLand);

    // The old rule's longest run (seed 424242) was ~156 tiles of straight line.
    expect(Math.max(...before.map((r) => r.longestRun))).toBeGreaterThan(130);
    expect(Math.max(...after.map((r) => r.longestRun))).toBeLessThan(110);
    // Bands thicker than ~2 tiles looked wrong in game: they must be rare now.
    expect(thickShare(before)).toBeGreaterThan(0.3);
    expect(thickShare(after)).toBeLessThan(0.15);
    // The land beside a range steps down through hills instead.
    expect(hillShare(after)).toBeGreaterThan(0.7);
    expect(hillShare(after)).toBeGreaterThan(hillShare(before));
    // Still a real feature, not erased.
    for (const r of after) expect(r.allTiles).toBeGreaterThan(150);
  }, 150_000);

  test("worlds stamped with the pre-fix version keep their exact old ranges", () => {
    setWorldSeed(2024, "continents", PRE_FIX_VERSION);
    const first: number[] = [];
    for (let i = 0; i < 4000; i += 1) first.push(isMountainRange((i * 7) % WORLD_WIDTH, (i * 13) % WORLD_HEIGHT) ? 1 : 0);
    setWorldSeed(2024, "continents", 1);
    const legacy: number[] = [];
    for (let i = 0; i < 4000; i += 1) legacy.push(isMountainRange((i * 7) % WORLD_WIDTH, (i * 13) % WORLD_HEIGHT) ? 1 : 0);
    expect(first).toEqual(legacy);
  });
});

describe("atolls (v10)", () => {
  // Land tiles near an atoll's centre form its ring; the ratio of the ring's
  // principal-axis variances is 1 for a circle and ~4 for a 2:1 oval.
  test("atoll rings are round, not stretched by the domain warp", () => {
    let atollsChecked = 0;
    for (const seed of [777777, 2024]) {
      setWorldSeed(seed, "continents", FIX_VERSION);
      const lagoon: Array<[number, number]> = [];
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        for (let x = 0; x < WORLD_WIDTH; x += 1) if (atollBumpAt(x, y) <= -0.45) lagoon.push([x, y]);
      }
      // Group lagoon tiles by atoll (centres are >= 64 tiles apart).
      const groups: Array<Array<[number, number]>> = [];
      for (const t of lagoon) {
        const g = groups.find((grp) => Math.hypot(grp[0]![0] - t[0], grp[0]![1] - t[1]) < 20);
        if (g) g.push(t);
        else groups.push([t]);
      }
      for (const g of groups) {
        const cx = Math.round(g.reduce((s, t) => s + t[0], 0) / g.length);
        const cy = Math.round(g.reduce((s, t) => s + t[1], 0) / g.length);
        const land: Array<[number, number]> = [];
        for (let dy = -22; dy <= 22; dy += 1) {
          for (let dx = -22; dx <= 22; dx += 1) {
            const x = (cx + dx + WORLD_WIDTH) % WORLD_WIDTH;
            const y = cy + dy;
            if (y < 0 || y >= WORLD_HEIGHT || Math.hypot(dx, dy) > 22) continue;
            if (terrainCodeAt(x, y) === 1 || terrainCodeAt(x, y) === TERRAIN_MOUNTAIN) land.push([dx, dy]);
          }
        }
        // Skip atolls fused to a coast or erased by the polar band: only an
        // isolated ring (under ~500 land tiles within 22 of its centre) is measurable.
        if (land.length < 40 || land.length > 500) continue;
        let sxx = 0;
        let sxy = 0;
        let syy = 0;
        for (const [dx, dy] of land) {
          sxx += dx * dx;
          sxy += dx * dy;
          syy += dy * dy;
        }
        const half = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
        const major = (sxx + syy) / 2 + half;
        const minor = (sxx + syy) / 2 - half;
        expect(major / minor).toBeLessThan(1.6);
        atollsChecked += 1;
      }
    }
    expect(atollsChecked).toBeGreaterThan(0);
  }, 120_000);
});
