import { describe, expect, it } from "vitest";
import { settlePixelWanderPoint } from "../client-capture-effects/client-capture-effects.js";
import { wanderPoint } from "./client-ancillary-wander.js";

// Regression: the 2D settle loader's old seed XORed small products of small
// tile coordinates, so every dot index returned ~(0.009, 0.014) and all dots
// drew on the same pixel at the tile's top-left corner, barely moving.
const REALISTIC_TILES: Array<[number, number]> = [
  [419, 87],
  [12, 340],
  [1200, 905]
];
const DOT_COUNT = 12;
const TILE_PX = 28;

const snapped = (t: number, wx: number, wy: number, i: number): string => {
  const p = settlePixelWanderPoint(t, wx, wy, i);
  return `${Math.floor(p.x * (TILE_PX - 2))},${Math.floor(p.y * (TILE_PX - 2))}`;
};

describe("2D settle dot wander", () => {
  it("is the same path the 3D renderer uses", () => {
    expect(settlePixelWanderPoint(12345, 419, 87, 3)).toEqual(wanderPoint(12345, 419, 87, 3));
  });

  it("spreads dots of one tile across the tile instead of stacking them", () => {
    for (const [wx, wy] of REALISTIC_TILES) {
      for (const t of [0, 900, 2000, 5000, 60_000]) {
        const points = Array.from({ length: DOT_COUNT }, (_, i) => settlePixelWanderPoint(t, wx, wy, i));
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.3);
        // After pixel snapping most dots occupy distinct pixels.
        const distinct = new Set(Array.from({ length: DOT_COUNT }, (_, i) => snapped(t, wx, wy, i)));
        expect(distinct.size).toBeGreaterThanOrEqual(DOT_COUNT - 2);
      }
    }
  });

  it("keeps every coordinate inside the tile", () => {
    for (let t = 0; t < 30_000; t += 370) {
      for (let i = 0; i < DOT_COUNT; i += 1) {
        const p = settlePixelWanderPoint(t, 419, 87, i);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("moves dots over time", () => {
    for (let i = 0; i < DOT_COUNT; i += 1) {
      const positions = new Set<string>();
      for (let t = 0; t < 30_000; t += 1000) positions.add(snapped(t, 419, 87, i));
      expect(positions.size).toBeGreaterThan(5);
    }
  });

  it("walks for 1700ms then pauses for 1000ms", () => {
    const cycles = 20;
    const span = 2700 * cycles;
    let movingMs = 0;
    let prev = settlePixelWanderPoint(0, 419, 87, 0);
    for (let t = 1; t <= span; t += 1) {
      const next = settlePixelWanderPoint(t, 419, 87, 0);
      if (next.x !== prev.x || next.y !== prev.y) movingMs += 1;
      prev = next;
    }
    expect(movingMs / span).toBeGreaterThan(1650 / 2700);
    expect(movingMs / span).toBeLessThan(1700 / 2700 + 0.01);
  });
});
