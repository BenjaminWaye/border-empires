import { describe, expect, it } from "vitest";
import { Color } from "three";
import { FOGGED_PRINT_WATER } from "./client-unexplored-storm/client-unexplored-storm-palette.js";
import { fillWaterVertexColors, WATER_DEEP_COLOR, WATER_SHALLOW_COLOR, type WaterTileState } from "./client-map-3d-water-surface-colors.js";

// One water tile at grid (0, 0) -> a 2x2 vertex grid, every vertex touching only it.
const colorsFor = (tile: WaterTileState): Float32Array => {
  const colors = new Float32Array(2 * 2 * 3);
  fillWaterVertexColors(colors, 2, 2, 0, 0, (gc, gr) => (gc === 0 && gr === 0 ? tile : undefined));
  return colors;
};

describe("fillWaterVertexColors", () => {
  it("keeps live water at the deep / shallow colours", () => {
    expect(Array.from(colorsFor({ shallow: false, fogged: false }).slice(0, 3))).toEqual([WATER_DEEP_COLOR.r, WATER_DEEP_COLOR.g, WATER_DEEP_COLOR.b].map(Math.fround));
    expect(colorsFor({ shallow: true, fogged: false })[0]).toBeCloseTo(WATER_SHALLOW_COLOR.r, 6);
  });

  it("pulls remembered water most of the way to the print tone", () => {
    const print = new Color(FOGGED_PRINT_WATER);
    const c = colorsFor({ shallow: true, fogged: true });
    const live = colorsFor({ shallow: true, fogged: false });
    expect(Math.abs(c[0]! - print.r)).toBeLessThan(Math.abs(live[0]! - print.r));
    expect(Math.abs(c[2]! - print.b)).toBeLessThan(Math.abs(live[2]! - print.b) * 0.5);
  });
});
