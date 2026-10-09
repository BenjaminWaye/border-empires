import { describe, expect, it } from "vitest";
import { buildUnexploredStormMask } from "./client-unexplored-storm-mask.js";

describe("buildUnexploredStormMask", () => {
  it("covers the window plus a one-tile ring, 255 = unexplored", () => {
    // Window 9x9 tiles + ring = 11x11; explored = the left half (wx < 50).
    const mask = buildUnexploredStormMask({ camX: 50, camY: 50, halfW: 4, halfH: 4 }, 1000, 1000, (wx) => wx < 50);
    expect([mask.width, mask.height]).toEqual([11, 11]);
    // Texel i holds wx = camX + i - halfW - 1, so i = 5 is wx 50 (fog), i = 4 is wx 49 (explored).
    expect(mask.data[5 * 11 + 5]).toBe(255);
    expect(mask.data[5 * 11 + 4]).toBe(0);
  });

  it("wraps world coordinates across the seam", () => {
    const seen: number[] = [];
    buildUnexploredStormMask({ camX: 0, camY: 0, halfW: 1, halfH: 0 }, 100, 100, (wx, wy) => {
      seen.push(wx, wy);
      return true;
    });
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(seen).toContain(98);
  });
});
