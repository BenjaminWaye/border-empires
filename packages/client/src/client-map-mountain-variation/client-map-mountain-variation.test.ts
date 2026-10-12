import { describe, expect, it } from "vitest";
import {
  mountainHash01,
  mountainNeighbourhoodAt,
  mountainVariationAt,
  SNOW_HEIGHT_SCALE,
  type MountainNeighbourhood
} from "./client-map-mountain-variation.js";

const LONE: MountainNeighbourhood = { north: false, east: false, south: false, west: false, cold: false };
const W = 20;
const H = 10;
const wrapX = (x: number): number => ((x % W) + W) % W;
const wrapY = (y: number): number => ((y % H) + H) % H;

describe("mountainHash01", () => {
  it("is deterministic and in [0, 1)", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = mountainHash01(i * 7, i * 13, i % 5);
      expect(v).toBe(mountainHash01(i * 7, i * 13, i % 5));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("varies across tiles and salts", () => {
    const values = new Set<number>();
    for (let x = 0; x < 10; x += 1) for (let y = 0; y < 10; y += 1) values.add(mountainHash01(x, y, 1));
    expect(values.size).toBe(100);
    expect(mountainHash01(3, 4, 1)).not.toBe(mountainHash01(3, 4, 2));
  });
});

describe("mountainVariationAt", () => {
  it("depends only on the world tile, not on how often or where it is asked", () => {
    expect(mountainVariationAt(41, 17, LONE)).toEqual(mountainVariationAt(41, 17, LONE));
  });

  it("keeps every property inside its range", () => {
    for (let x = 0; x < 40; x += 1) {
      for (let y = 0; y < 40; y += 1) {
        const v = mountainVariationAt(x, y, LONE);
        expect(v.yaw).toBeGreaterThanOrEqual(0);
        expect(v.yaw).toBeLessThan(Math.PI / 2);
        expect(v.heightScale).toBeGreaterThanOrEqual(0.82);
        expect(v.heightScale).toBeLessThanOrEqual(1.4);
        expect(v.footprintScale).toBeGreaterThanOrEqual(0.9);
        expect(v.footprintScale).toBeLessThanOrEqual(1.1);
        expect(Math.abs(v.tint)).toBeLessThanOrEqual(1);
        if (v.secondary) {
          const d = Math.hypot(v.secondary.dx, v.secondary.dz);
          expect(d).toBeGreaterThanOrEqual(0.22 - 1e-9);
          expect(d).toBeLessThanOrEqual(0.3 + 1e-9);
          expect(v.secondary.scale).toBeLessThan(1);
        }
      }
    }
  });

  it("gives some tiles a second peak and some not", () => {
    let twins = 0;
    for (let x = 0; x < 30; x += 1) for (let y = 0; y < 30; y += 1) if (mountainVariationAt(x, y, LONE).secondary) twins += 1;
    expect(twins).toBeGreaterThan(900 * 0.3);
    expect(twins).toBeLessThan(900 * 0.6);
  });

  it("snows on tall peaks, and on every peak in cold country", () => {
    for (let x = 0; x < 30; x += 1) {
      for (let y = 0; y < 30; y += 1) {
        const warm = mountainVariationAt(x, y, LONE);
        expect(warm.snow).toBe(warm.heightScale >= SNOW_HEIGHT_SCALE);
        // The range bonus raises the peak but doesn't add snow.
        expect(mountainVariationAt(x, y, { ...LONE, north: true, south: true, east: true }).snow).toBe(warm.snow);
        expect(mountainVariationAt(x, y, { ...LONE, cold: true }).snow).toBe(true);
      }
    }
  });

  it("raises the spine of a range above the same tile standing alone", () => {
    const ranged = mountainVariationAt(5, 5, { north: true, east: true, south: true, west: false, cold: false });
    expect(ranged.heightScale).toBeGreaterThan(mountainVariationAt(5, 5, LONE).heightScale);
  });

  it("draws a saddle only toward east/south mountain neighbours, none for a lone mountain", () => {
    const lone = mountainVariationAt(2, 2, LONE);
    expect(lone.saddleEast).toBe(false);
    expect(lone.saddleSouth).toBe(false);
    const v = mountainVariationAt(2, 2, { north: true, east: true, south: false, west: true, cold: false });
    expect(v.saddleEast).toBe(true);
    expect(v.saddleSouth).toBe(false);
  });
});

describe("mountainNeighbourhoodAt", () => {
  it("reads orthogonal mountains and cold tiles across the world wrap", () => {
    const mountains = new Set(["0,0", "19,0", "0,9"]);
    const n = mountainNeighbourhoodAt(0, 0, {
      isMountainAt: (x, y) => mountains.has(`${x},${y}`),
      isColdAt: (x, y) => x === 19 && y === 9,
      wrapX,
      wrapY
    });
    expect(n).toEqual({ north: true, east: false, south: false, west: true, cold: true });
  });
});
