import { describe, expect, it } from "vitest";
import { computeHeightfieldCorner, type HeightfieldCornerOut, type HeightfieldTileSample } from "./client-map-3d-heightfield-corners.js";
import { COAST_EDGE_Y } from "../client-map-3d-heightfield-terrain.js";

const tile = (overrides: Partial<HeightfieldTileSample> = {}): HeightfieldTileSample => ({
  elevation: 0.18,
  r: 0.4,
  g: 0.6,
  b: 0.3,
  isSea: false,
  isExplored: true,
  isHills: false,
  isTundra: false,
  forestProx: 0,
  ...overrides
});
const LAND = tile();
const corner = (s: readonly [HeightfieldTileSample, HeightfieldTileSample, HeightfieldTileSample, HeightfieldTileSample]): HeightfieldCornerOut => {
  const out: HeightfieldCornerOut = { elevation: 0, r: 0, g: 0, b: 0 };
  computeHeightfieldCorner(out, s[0], s[1], s[2], s[3], 10, 10);
  return out;
};

describe("heightfield corner categories", () => {
  it("averages all-land corners flat at land height", () => {
    expect(corner([LAND, LAND, LAND, tile({ elevation: 0.22 })]).elevation).toBeCloseTo(0.19);
  });

  it("never lets a hills tile raise a flat neighbour's corner", () => {
    expect(corner([LAND, LAND, LAND, tile({ isHills: true, elevation: 0.63 })]).elevation).toBeCloseTo(0.18);
  });

  it("pulls a coast corner down to the beach bevel", () => {
    const out = corner([LAND, LAND, LAND, tile({ isSea: true, elevation: -0.16 })]);
    expect(out.elevation).toBeLessThan(0.18);
    expect(Math.abs(out.elevation - COAST_EDGE_Y)).toBeLessThan(0.1);
  });
});
