import { describe, expect, it } from "vitest";
import { buildUnexploredStormMask } from "./client-unexplored-storm-mask.js";

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
