import { describe, expect, it } from "vitest";
import { buildUnexploredStormMask } from "./client-unexplored-storm-mask.js";

const at = (mask: ReturnType<typeof buildUnexploredStormMask>, i: number, j: number) => ({
  hard: mask.data[(j * mask.width + i) * 2]!,
  soft: mask.data[(j * mask.width + i) * 2 + 1]! / 255
});

describe("buildUnexploredStormMask", () => {
  // Window 9x9 tiles + ring = 11x11; explored = the left half (dx < 0).
  const window = { camX: 50, camY: 50, halfW: 4, halfH: 4 };
  const mask = buildUnexploredStormMask(window, 1000, 1000, (wx) => wx < 50);

  it("marks unexplored tiles hard and saturates their soft value", () => {
    expect(at(mask, 5, 5)).toEqual({ hard: 255, soft: 1 });
    expect(at(mask, 4, 5).hard).toBe(0);
  });

  it("ramps the soft field down into explored land, reaching 0 two tiles in", () => {
    const row = 5; // away from the window's top/bottom ring
    expect(at(mask, 4, row).soft).toBeCloseTo(0.25, 2); // touching the fog
    expect(at(mask, 3, row).soft).toBe(0);
  });

  it("treats everything beyond the window as unexplored", () => {
    // Explored tile on the left ring edge still sees fog to its left.
    expect(at(mask, 0, 5).soft).toBeGreaterThan(0);
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
