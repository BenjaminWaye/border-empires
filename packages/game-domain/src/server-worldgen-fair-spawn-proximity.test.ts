import { describe, expect, it } from "vitest";
import type { DomainTileState } from "./index/index.js";
import { regionProximityMask, wrappedProximityMask } from "./server-worldgen-fair-spawn-proximity.js";

// Deterministic LCG so a failure reproduces.
const rng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

// The pre-mask scans computeFairSpawnSites used, kept verbatim as the oracle.
const wrappedScan = (points: Array<{ x: number; y: number }>, radius: number, width: number, height: number) => (x: number, y: number) =>
  points.some((p) => Math.min(Math.abs(p.x - x), width - Math.abs(p.x - x)) + Math.min(Math.abs(p.y - y), height - Math.abs(p.y - y)) <= radius);
const regionScan = (points: Array<{ x: number; y: number }>, radius: number, regionAt: (x: number, y: number) => number | undefined) => (x: number, y: number) => {
  const origin = regionAt(x, y);
  return points.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= radius && (origin === undefined || regionAt(p.x, p.y) === origin));
};

describe("fair-spawn proximity masks", () => {
  it("wrappedProximityMask answers exactly like the torus Manhattan scan, including across the seams", () => {
    const random = rng(7);
    const width = 61;
    const height = 37;
    for (const radius of [0, 3, 8, 17]) {
      const points = Array.from({ length: 25 }, () => ({ x: Math.floor(random() * width), y: Math.floor(random() * height) }));
      points.push({ x: 0, y: 0 }, { x: width - 1, y: height - 1 });
      const mask = wrappedProximityMask(points, radius, width, height);
      const scan = wrappedScan(points, radius, width, height);
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) expect(mask(x, y), `r=${radius} ${x},${y}`).toBe(scan(x, y));
    }
  });

  it("wrappedProximityMask falls back to the scan when the diamond is wider than the world", () => {
    const points = [{ x: 1, y: 1 }];
    const mask = wrappedProximityMask(points, 10, 12, 12);
    const scan = wrappedScan(points, 10, 12, 12);
    for (let y = 0; y < 12; y += 1) for (let x = 0; x < 12; x += 1) expect(mask(x, y)).toBe(scan(x, y));
  });

  it("regionProximityMask answers exactly like the same-region Manhattan scan", () => {
    const random = rng(11);
    const width = 48;
    const height = 30;
    const tiles: DomainTileState[] = [];
    const region = new Map<string, number>();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sea = (x * 7 + y * 3) % 11 === 0 || x === 20;
        tiles.push({ x, y, terrain: sea ? "SEA" : "LAND" });
        if (!sea) region.set(`${x},${y}`, x < 20 ? 1 : 2);
      }
    }
    const regionAt = (x: number, y: number) => region.get(`${x},${y}`);
    for (const radius of [0, 4, 10]) {
      const points = Array.from({ length: 30 }, () => ({ x: Math.floor(random() * width), y: Math.floor(random() * height) }));
      const mask = regionProximityMask(points, radius, tiles, regionAt);
      const scan = regionScan(points, radius, regionAt);
      for (let y = -2; y < height + 2; y += 1) for (let x = -2; x < width + 2; x += 1) expect(mask(x, y), `r=${radius} ${x},${y}`).toBe(scan(x, y));
    }
  });
});
