// Regression coverage for the v10 shape fixes: continents-style mountain
// ranges used to run ruler-straight along Voronoi plate boundaries (150+
// tiles) and fill wide solid wedges wherever the boundary flattened; now they
// are a thin (<= ~2 tile) wandering core wrapped in hills. Atolls were
// continent-sized perfect rings; now they are small reef-islet rings out in
// open ocean. See worldgen-natural-ranges.ts / worldgen-atoll-shape.ts.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { atollBumpAt, atollSites } from "./worldgen-archipelago-features.js";
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
    // Measured on 424242: 0.56 (v9) -> 0.70 (v10); 0.70-0.87 across other seeds.
    expect(hillShare(after)).toBeGreaterThan(hillShare(before) + 0.1);
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
  type AtollSample = { extent: number; islets: number; otherLandShare: number };
  // Every atoll (and companion) on the map: its reef land's extent, how many
  // separate islets that reef forms, and how much NON-atoll land sits just
  // outside it.
  const atollSamples = (seed: number, version: number): AtollSample[] => {
    setWorldSeed(seed, "continents", version);
    // Reef tiles of each atoll: within its own reach, attributed to the
    // nearest atoll so a close companion isn't counted as part of it.
    const sites = atollSites();
    const groups: Array<Array<[number, number]>> = sites.map(() => []);
    sites.forEach((site, i) => {
      const reach = Math.ceil(site.outerRadius * 1.6) + 2;
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const x = (site.cx + dx + WORLD_WIDTH) % WORLD_WIDTH;
          const y = site.cy + dy;
          if (y < 0 || y >= WORLD_HEIGHT || atollBumpAt(x, y) <= 0.05) continue;
          const nearest = sites.reduce((best, s2, j) =>
            Math.hypot(s2.cx - x, s2.cy - y) < Math.hypot(sites[best]!.cx - x, sites[best]!.cy - y) ? j : best, i);
          if (nearest === i) groups[i]!.push([site.cx + dx, y]);
        }
      }
    });
    const isLand = (x: number, y: number): boolean => {
      const t = terrainCodeAt((x + WORLD_WIDTH) % WORLD_WIDTH, y);
      return t === TERRAIN_LAND || t === TERRAIN_MOUNTAIN;
    };
    return groups.map((g, gi) => {
      const land = g.filter(([x, y]) => isLand(x, y));
      const xs = land.map((p) => p[0]);
      const ys = land.map((p) => p[1]);
      const extent = land.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1 : 0;
      // Islets: 8-connected components of the reef's land tiles.
      const keys = new Set(land.map(([x, y]) => `${x},${y}`));
      const seen = new Set<string>();
      let islets = 0;
      for (const k of keys) {
        if (seen.has(k)) continue;
        islets += 1;
        const stack = [k];
        seen.add(k);
        while (stack.length) {
          const [cx, cy] = stack.pop()!.split(",").map(Number) as [number, number];
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nk = `${cx + dx},${cy + dy}`;
              if (keys.has(nk) && !seen.has(nk)) {
                seen.add(nk);
                stack.push(nk);
              }
            }
          }
        }
      }
      const cx = sites[gi]!.cx;
      const cy = sites[gi]!.cy;
      let band = 0;
      let other = 0;
      for (let dy = -16; dy <= 16; dy += 1) {
        for (let dx = -16; dx <= 16; dx += 1) {
          const r = Math.hypot(dx, dy);
          const y = cy + dy;
          if (r <= 10 || r > 16 || y < 0 || y >= WORLD_HEIGHT) continue;
          band += 1;
          const x = (cx + dx + WORLD_WIDTH) % WORLD_WIDTH;
          if (isLand(x, y) && atollBumpAt(x, y) <= 0.05) other += 1;
        }
      }
      return { extent, islets, otherLandShare: other / Math.max(1, band) };
    });
  };

  test("atolls are small, broken into islets and out in open ocean -- not continent-sized perfect rings", () => {
    const after = [101, 424242, 40004].flatMap((seed) => atollSamples(seed, FIX_VERSION)).filter((a) => a.extent > 0);
    expect(after.length).toBeGreaterThanOrEqual(6);
    for (const a of after) {
      // At most ~15 tiles across, most 8-12 (pre-v10: 18-30 tiles, ~1,100-1,900 km).
      expect(a.extent).toBeLessThanOrEqual(16);
      expect(a.otherLandShare).toBeLessThan(0.2);
    }
    // Most reefs break into separate islets rather than one closed ring.
    expect(after.filter((a) => a.islets >= 2).length / after.length).toBeGreaterThan(0.5);

    const before = atollSamples(202, PRE_FIX_VERSION).filter((a) => a.extent > 0);
    expect(Math.max(...before.map((a) => a.extent))).toBeGreaterThanOrEqual(18);
  }, 180_000);
});
