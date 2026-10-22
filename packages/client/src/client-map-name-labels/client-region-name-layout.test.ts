import { describe, expect, it } from "vitest";
import { layoutNameInRegion } from "./client-region-name-layout.js";

const rect = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number): boolean => x >= x0 && x <= x1 && y >= y0 && y <= y1;

describe("layoutNameInRegion", () => {
  it("runs the name along the middle of the region the seeds land in", () => {
    // Region rows 10..16; seed line hugs its top edge (row 10).
    const layout = layoutNameInRegion([{ x: 2, y: 10 }, { x: 20, y: 10 }], rect(0, 10, 24, 16))!;
    const ys = layout.points.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(11.5);
    expect(Math.max(...ys)).toBeLessThan(14.5);
  });

  it("ignores regions the seeds don't touch", () => {
    const twoBlocks = (x: number, y: number): boolean => rect(0, 0, 5, 5)(x, y) || rect(20, 0, 30, 5)(x, y);
    const layout = layoutNameInRegion([{ x: 2, y: 2 }], twoBlocks)!;
    expect(Math.max(...layout.points.map((p) => p.x))).toBeLessThan(6);
  });

  it("still places a name on a strip too thin to have a core", () => {
    expect(layoutNameInRegion([{ x: 3, y: 0 }], rect(0, 0, 10, 0))).toBeDefined();
  });

  it("returns nothing when no seed is inside", () => {
    expect(layoutNameInRegion([{ x: 50, y: 50 }], rect(0, 0, 5, 5))).toBeUndefined();
  });
});
