import { describe, expect, it } from "vitest";
import {
  createObservatoryRangeBorderGeometry,
  createObservatoryRangeFillGeometry,
  observatoryRangeBorderSegmentCount,
  observatoryRangeFillVertexCount,
  writeObservatoryRangeBorderGeometry,
  writeObservatoryRangeFillGeometry
} from "./client-map-3d-observatory-range.js";

const wrap = (value: number, dim: number): number => {
  const mod = value % dim;
  return mod < 0 ? mod + dim : mod;
};

describe("3d observatory range border geometry", () => {
  it("uses one terrain-following segment per tile edge around the range", () => {
    expect(observatoryRangeBorderSegmentCount(5)).toBe(44);
    expect(observatoryRangeBorderSegmentCount(10)).toBe(84);
    expect(observatoryRangeFillVertexCount(5)).toBe(726);
    expect(observatoryRangeFillVertexCount(10)).toBe(2646);
  });

  it("keeps wrapped range borders continuous around the selected tile", () => {
    const geometry = createObservatoryRangeBorderGeometry(observatoryRangeBorderSegmentCount(5));
    const sampledCorners: Array<[number, number]> = [];

    const written = writeObservatoryRangeBorderGeometry(geometry, {
      selectedX: 1,
      selectedY: 3,
      camX: 0,
      camY: 2,
      radius: 5,
      worldWidth: 20,
      worldHeight: 20,
      wrapX: (x) => wrap(x, 20),
      wrapY: (y) => wrap(y, 20),
      cornerYAt: (x, y) => {
        sampledCorners.push([x, y]);
        return x * 0.01 + y * 0.001;
      },
      riseAboveSurface: 0.25
    });

    expect(written).toBe(44);
    expect(geometry.drawRange.count).toBe(88);
    const positions = geometry.getAttribute("position").array as Float32Array;
    const firstSegment = Array.from(positions.slice(0, 6));
    expect(firstSegment[0]).toBe(-4);
    expect(firstSegment[1]).toBeCloseTo(0.25 + 16 * 0.01 + 18 * 0.001);
    expect(firstSegment[2]).toBe(-4);
    expect(firstSegment[3]).toBe(-3);
    expect(firstSegment[4]).toBeCloseTo(0.25 + 17 * 0.01 + 18 * 0.001);
    expect(firstSegment[5]).toBe(-4);
    expect(sampledCorners.slice(0, 2)).toEqual([
      [16, 18],
      [17, 18]
    ]);
  });

  it("fills the same wrapped terrain-following square as the border", () => {
    const geometry = createObservatoryRangeFillGeometry(observatoryRangeFillVertexCount(1));
    const sampledCorners: Array<[number, number]> = [];

    const written = writeObservatoryRangeFillGeometry(geometry, {
      selectedX: 0,
      selectedY: 0,
      camX: 19,
      camY: 19,
      radius: 1,
      worldWidth: 20,
      worldHeight: 20,
      wrapX: (x) => wrap(x, 20),
      wrapY: (y) => wrap(y, 20),
      cornerYAt: (x, y) => {
        sampledCorners.push([x, y]);
        return x * 0.01 + y * 0.001;
      },
      riseAboveSurface: 0.1
    });

    expect(written).toBe(54);
    expect(geometry.drawRange.count).toBe(54);
    const positions = geometry.getAttribute("position").array as Float32Array;
    const firstTriangle = Array.from(positions.slice(0, 9));
    expect(firstTriangle[0]).toBeCloseTo(0);
    expect(firstTriangle[1]).toBeCloseTo(0.1 + 19 * 0.01 + 19 * 0.001);
    expect(firstTriangle[2]).toBeCloseTo(0);
    expect(firstTriangle[3]).toBeCloseTo(0);
    expect(firstTriangle[4]).toBeCloseTo(0.1 + 19 * 0.01);
    expect(firstTriangle[5]).toBeCloseTo(1);
    expect(firstTriangle[6]).toBeCloseTo(1);
    expect(firstTriangle[7]).toBeCloseTo(0.1 + 19 * 0.001);
    expect(firstTriangle[8]).toBeCloseTo(0);
    expect(sampledCorners.slice(0, 3)).toEqual([
      [19, 19],
      [19, 0],
      [0, 19]
    ]);
  });
});
