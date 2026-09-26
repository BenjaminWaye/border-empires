import { describe, expect, it } from "vitest";
import {
  computeHeightfieldCorner,
  riverCarveDepthForHalfWidth,
  type HeightfieldCornerOut,
  type HeightfieldTileSample
} from "./client-map-3d-heightfield-corners.js";
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
const corner = (s: readonly [HeightfieldTileSample, HeightfieldTileSample, HeightfieldTileSample, HeightfieldTileSample], carve: number): HeightfieldCornerOut => {
  const out: HeightfieldCornerOut = { elevation: 0, r: 0, g: 0, b: 0 };
  computeHeightfieldCorner(out, s[0], s[1], s[2], s[3], 10, 10, carve);
  return out;
};

describe("heightfield corner river carve (v9 edge rivers)", () => {
  it("pulls an all-land river corner down by the carve depth and darkens it into a bank", () => {
    const depth = riverCarveDepthForHalfWidth(0.12);
    const flat = corner([LAND, LAND, LAND, LAND], 0);
    const carved = corner([LAND, LAND, LAND, LAND], depth);
    expect(flat.elevation).toBeCloseTo(0.18);
    expect(carved.elevation).toBeCloseTo(0.18 - depth);
    expect(carved.g).toBeLessThan(flat.g);
  });

  it("carves deeper toward the mouth (wider river) and not at all where there's no river", () => {
    expect(riverCarveDepthForHalfWidth(0)).toBe(0);
    expect(riverCarveDepthForHalfWidth(0.2)).toBeGreaterThan(riverCarveDepthForHalfWidth(0.07));
  });

  it("never carves a corner touching a hills tile (the dome collar pins to the uncarved corner)", () => {
    const withHill = [LAND, LAND, LAND, tile({ isHills: true, elevation: 0.63 })] as const;
    expect(corner(withHill, 0.12).elevation).toBeCloseTo(corner(withHill, 0).elevation);
  });

  it("never carves a coast corner (the river mouth), which already sits at the coast bevel", () => {
    const coast = [LAND, LAND, LAND, tile({ isSea: true, elevation: -0.16 })] as const;
    const out = corner(coast, 0.12);
    expect(out.elevation).toBeCloseTo(corner(coast, 0).elevation);
    expect(out.elevation).toBeLessThan(0.18);
    expect(Math.abs(out.elevation - COAST_EDGE_Y)).toBeLessThan(0.1);
  });
});
