import { describe, expect, it } from "vitest";
import { fortBreachLayout, type BreachDimensions } from "./client-map-3d-fort-breach.js";

const DIMS: BreachDimensions = { wallLength: 0.86, wallHeight: 0.42, wallThickness: 0.08, wallOffset: 0.42, towerSide: 0.16, towerHeight: 0.58, towerOffset: 0.38 };

describe("fortBreachLayout", () => {
  it("smashes one closed wall into two shorter, lower stubs with a gap between them", () => {
    const layout = fortBreachLayout(DIMS, 12, new Set());
    expect(layout.direction).toBeDefined();
    expect(layout.stubs).toHaveLength(2);
    const total = layout.stubs.reduce((sum, stub) => sum + stub.length, 0);
    expect(total).toBeLessThan(DIMS.wallLength * 0.7);
    for (const stub of layout.stubs) expect(stub.heightFraction).toBeLessThan(1);
    // Spilled stone, a snapped tower and its fallen top lying inside the walls.
    expect(layout.blocks.length).toBeGreaterThan(15);
    expect(layout.stumpFraction).toBeLessThan(0.5);
    expect(Math.abs(layout.fallenTop.x)).toBeLessThan(0.5);
    expect(Math.abs(layout.fallenTop.z)).toBeLessThan(0.5);
    expect(layout.fallenTop.tilt).toBeCloseTo(Math.PI / 2);
  });

  it("never breaches an opening onto a neighbouring fort", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const layout = fortBreachLayout(DIMS, seed, new Set(["N", "E", "S"]));
      expect(layout.direction).toBe("W");
    }
    const enclosed = fortBreachLayout(DIMS, 3, new Set(["N", "E", "S", "W"]));
    expect(enclosed.direction).toBeUndefined();
    expect(enclosed.stubs).toEqual([]);
  });

  it("is stable for a seed", () => {
    expect(fortBreachLayout(DIMS, 42, new Set())).toEqual(fortBreachLayout(DIMS, 42, new Set()));
  });
});
