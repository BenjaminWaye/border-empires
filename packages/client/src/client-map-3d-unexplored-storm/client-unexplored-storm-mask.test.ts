import { describe, expect, it } from "vitest";
import type { TerrainWindow } from "../client-map-3d-terrain-window/client-map-3d-terrain-window.js";
import type { TileVisibilityState } from "../client-types.js";
import { encodeUnexploredStormMask, sampleUnexploredStormGrid } from "./client-unexplored-storm-mask.js";
import { createUnexploredStormReveal } from "./client-map-3d-unexplored-storm-reveal.js";

// The production path: sample the window, encode through the reveal (a first
// grid never animates, so this is the plain mask).
const buildUnexploredStormMask = (window: TerrainWindow, worldWidth: number, worldHeight: number, visibilityAt: (wx: number, wy: number) => TileVisibilityState) => {
  const reveal = createUnexploredStormReveal();
  reveal.onGrid(sampleUnexploredStormGrid(window, worldWidth, worldHeight, visibilityAt), 0);
  return reveal.encode(0);
};

const at = (mask: ReturnType<typeof buildUnexploredStormMask>, i: number, j: number) => ({
  unexplored: mask.data[(j * mask.width + i) * 4]!,
  field: mask.data[(j * mask.width + i) * 4 + 1]! / 255
});

describe("buildUnexploredStormMask", () => {
  // Window 9x9 tiles + ring = 11x11; explored = wx < 50. Texel i holds
  // wx = camX + i - halfW - 1, so i <= 4 is explored, i = 5 is the first
  // fog ring, i >= 6 is deep fog.
  // wx < 48 in sight, 48-49 remembered, >= 50 unexplored.
  const mask = buildUnexploredStormMask({ camX: 50, camY: 50, halfW: 4, halfH: 4 }, 1000, 1000, (wx) => (wx < 48 ? "visible" : wx < 50 ? "fogged" : "unexplored"));
  const row = 5;

  it("flags unexplored tiles in R", () => {
    expect([mask.width, mask.height]).toEqual([11, 11]);
    expect(at(mask, 4, row).unexplored).toBe(0);
    expect(at(mask, 5, row).unexplored).toBe(255);
  });

  it("puts the coast field's ramp across the first fog ring, not on explored land", () => {
    // Deep fog saturates; the ring tile sits partway; explored tiles next to
    // the ring see no deep fog at all.
    expect(at(mask, 6, row).field).toBe(1);
    expect(at(mask, 5, row).field).toBeCloseTo(0.25, 2);
    expect(at(mask, 4, row).field).toBe(0);
  });

  it("treats a lone fog tile inside explored land as ring, not deep", () => {
    const pocket = buildUnexploredStormMask({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, 100, 100, (wx, wy) => (wx === 10 && wy === 10 ? "unexplored" : "visible"));
    const centre = (pocket.height >> 1) * pocket.width + (pocket.width >> 1);
    expect(pocket.data[centre * 4]).toBe(255);
    expect(pocket.data[centre * 4 + 1]).toBeLessThan(255);
  });

  it("wraps world coordinates across the seam", () => {
    const seen: number[] = [];
    buildUnexploredStormMask({ camX: 0, camY: 0, halfW: 1, halfH: 0 }, 100, 100, (wx, wy) => {
      seen.push(wx, wy);
      return "visible";
    });
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(seen).toContain(98);
  });
});

describe("encodeUnexploredStormMask (fractional exploredness, for the reveal)", () => {
  // A 5x1 strip: tile 0 explored, tile 1 rolling back (e), tiles 2-4 unexplored.
  const strip = (e: number, flash = 0) =>
    encodeUnexploredStormMask(5, 1, Float32Array.from([1, e, 0, 0, 0]), Float32Array.from([0, flash, 0, 0, 0]));
  const r = (mask: ReturnType<typeof strip>, i: number) => mask.data[i * 4]!;
  const g = (mask: ReturnType<typeof strip>, i: number) => mask.data[i * 4 + 1]!;

  it("matches the plain mask at whole tiles", () => {
    expect(Array.from(strip(0).data)).toEqual(Array.from(encodeUnexploredStormMask(5, 1, Float32Array.from([1, 0, 0, 0, 0])).data));
  });

  it("moves R and the deep-fog field smoothly as a tile rolls back -- no jumps", () => {
    let lastR = 256;
    let lastG3 = 256;
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const mask = strip(Math.min(1, e));
      expect(r(mask, 1)).toBeLessThanOrEqual(lastR);
      // The deep fog two tiles out recedes as its neighbour is explored...
      expect(g(mask, 3)).toBeLessThanOrEqual(lastG3);
      // ...a step at a time, never a jump (G is 0..255).
      if (lastG3 !== 256) expect(lastG3 - g(mask, 3)).toBeLessThan(40);
      lastR = r(mask, 1);
      lastG3 = g(mask, 3);
    }
    expect(r(strip(1), 1)).toBe(0);
  });

  it("carries the reveal's lantern flash in B", () => {
    expect(strip(0.5, 0.8).data[1 * 4 + 2]).toBe(204);
    expect(strip(0.5).data[1 * 4 + 2]).toBe(0);
  });
});
