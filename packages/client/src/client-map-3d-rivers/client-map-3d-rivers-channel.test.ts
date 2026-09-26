import { describe, expect, it } from "vitest";
import {
  appendWater,
  chaikinSmooth,
  heightfieldSurfaceY,
  indexCenterlines,
  nearestOnSegments,
  RIVER_WATER_DEPTH,
  riverTrenchDepth,
  riverWaterHalfWidth,
  TRENCH_DEPTH,
  type ChannelPathPoint,
  type WaterBuffers
} from "./client-map-3d-rivers-channel.js";

const p = (x: number, z: number, halfWidth = 0.1): ChannelPathPoint => ({ x, z, halfWidth });

describe("v9 river channel geometry", () => {
  it("rounds the edge staircase's right angles but keeps both endpoints", () => {
    const smoothed = chaikinSmooth([p(0, 0), p(1, 0), p(1, 1)]);
    expect(smoothed[0]).toEqual(p(0, 0));
    expect(smoothed[smoothed.length - 1]).toEqual(p(1, 1));
    expect(smoothed.some((q) => q.x === 1 && q.z === 0)).toBe(false); // the sharp corner is cut
  });

  it("samples the heightfield's own triangles (split along the (1,0)-(0,1) diagonal)", () => {
    const corners: Record<string, number> = { "10,20": 0, "11,20": 0.2, "10,21": 0.4, "11,21": 1 };
    const cornerYAt = (x: number, z: number): number => corners[`${x},${z}`] ?? 0;
    expect(heightfieldSurfaceY(0, 0, 10, 20, cornerYAt)).toBeCloseTo(0);
    expect(heightfieldSurfaceY(0.99, 0.99, 10, 20, cornerYAt)).toBeCloseTo(1, 1);
    expect(heightfieldSurfaceY(0.5, 0.5, 10, 20, cornerYAt)).toBeCloseTo(0.3);
  });

  it("trench: flat bed, banks rising to ground level, and never reaching a regular tile's edge", () => {
    const hw = 0.24; // widest river
    expect(riverTrenchDepth(0, hw)).toBe(TRENCH_DEPTH);
    expect(riverTrenchDepth(hw * 0.5, hw)).toBe(TRENCH_DEPTH);
    expect(riverTrenchDepth(hw + 0.1, hw)).toBeGreaterThan(0);
    expect(riverTrenchDepth(hw + 0.1, hw)).toBeLessThan(TRENCH_DEPTH);
    // Valley tiles meet regular heightfield tiles >= ~0.95 from the river;
    // the trench must be fully back at ground level well before that.
    expect(riverTrenchDepth(0.6, hw)).toBe(0);
  });

  it("water fills the trench part-way: its edge sits where the bank rises through the waterline", () => {
    const hw = 0.15;
    const edge = riverWaterHalfWidth(hw);
    expect(edge).toBeGreaterThan(hw * 0.8);
    expect(riverTrenchDepth(edge - 0.03, hw)).toBeGreaterThan(RIVER_WATER_DEPTH);
    expect(riverTrenchDepth(edge + 0.03, hw)).toBeLessThan(RIVER_WATER_DEPTH);
  });

  it("builds a level water strip (edge, middle, edge) per centreline sample", () => {
    const buffers: WaterBuffers = { positions: [], colors: [], uvs: [], indices: [] };
    appendWater(buffers, [p(0, 0), p(1, 0), p(2, 0)], () => -0.02, (x, z) => [x, z]);
    expect(buffers.positions.length / 3).toBe(9);
    for (let i = 1; i < buffers.positions.length; i += 3) expect(buffers.positions[i]).toBe(-0.02);
    expect(buffers.indices.length).toBe(2 * 2 * 6);
  });

  it("finds the nearest centreline segment near a tile, and its width", () => {
    const index = indexCenterlines([[p(0, 0, 0.1), p(0.2, 0, 0.2)]]);
    const out = { distance: 0, halfWidth: 0 };
    expect(nearestOnSegments(index.segmentsNearTile(0, 0), 0.1, 0.3, out)).toBe(true);
    expect(out.distance).toBeCloseTo(0.3);
    expect(out.halfWidth).toBeCloseTo(0.15);
    expect(index.segmentsNearTile(5, 5)).toHaveLength(0);
  });
});
