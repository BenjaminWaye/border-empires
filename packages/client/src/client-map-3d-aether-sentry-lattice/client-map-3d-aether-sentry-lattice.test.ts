import { describe, expect, it } from "vitest";
import {
  catenaryPoint,
  hasAnyEdge,
  isCornerPylon,
  pylonInsetOffset,
  tetherSparkT,
  tileQuadCorners
} from "./client-map-3d-aether-sentry-lattice.js";

const NO_EDGES = { top: false, right: false, bottom: false, left: false };

describe("hasAnyEdge", () => {
  it("is false when no edges are set", () => {
    expect(hasAnyEdge(NO_EDGES)).toBe(false);
  });

  it("is true when any single edge is set", () => {
    expect(hasAnyEdge({ ...NO_EDGES, top: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, right: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, bottom: true })).toBe(true);
    expect(hasAnyEdge({ ...NO_EDGES, left: true })).toBe(true);
  });
});

describe("isCornerPylon", () => {
  it("is false with no edges", () => {
    expect(isCornerPylon(NO_EDGES)).toBe(false);
  });

  it("is false for a single straight edge", () => {
    expect(isCornerPylon({ ...NO_EDGES, top: true })).toBe(false);
    expect(isCornerPylon({ ...NO_EDGES, right: true })).toBe(false);
    expect(isCornerPylon({ ...NO_EDGES, bottom: true })).toBe(false);
    expect(isCornerPylon({ ...NO_EDGES, left: true })).toBe(false);
  });

  it("is true when a vertical-axis edge and a horizontal-axis edge are both set (a turn)", () => {
    expect(isCornerPylon({ top: true, right: true, bottom: false, left: false })).toBe(true);
    expect(isCornerPylon({ top: true, right: false, bottom: false, left: true })).toBe(true);
    expect(isCornerPylon({ top: false, right: true, bottom: true, left: false })).toBe(true);
    expect(isCornerPylon({ top: false, right: false, bottom: true, left: true })).toBe(true);
  });

  it("is true for opposite edges on the same axis plus a perpendicular edge (still has both axes)", () => {
    expect(isCornerPylon({ top: true, bottom: true, right: true, left: false })).toBe(true);
  });

  it("is false for both edges on the same axis alone (thin straight spit, no turn)", () => {
    expect(isCornerPylon({ top: true, bottom: true, right: false, left: false })).toBe(false);
    expect(isCornerPylon({ top: false, bottom: false, right: true, left: true })).toBe(false);
  });
});

describe("pylonInsetOffset", () => {
  it("is zero with no active edges", () => {
    expect(pylonInsetOffset(NO_EDGES)).toEqual({ dx: 0, dz: 0 });
  });

  it("pushes south (+z) away from a top edge", () => {
    const { dx, dz } = pylonInsetOffset({ ...NO_EDGES, top: true });
    expect(dx).toBeCloseTo(0);
    expect(dz).toBeGreaterThan(0);
  });

  it("pushes north (-z) away from a bottom edge", () => {
    const { dz } = pylonInsetOffset({ ...NO_EDGES, bottom: true });
    expect(dz).toBeLessThan(0);
  });

  it("pushes east (+x) away from a left edge", () => {
    const { dx } = pylonInsetOffset({ ...NO_EDGES, left: true });
    expect(dx).toBeGreaterThan(0);
  });

  it("pushes west (-x) away from a right edge", () => {
    const { dx } = pylonInsetOffset({ ...NO_EDGES, right: true });
    expect(dx).toBeLessThan(0);
  });

  it("blends both axes for a corner and stays a bounded-length offset", () => {
    const { dx, dz } = pylonInsetOffset({ top: true, right: true, bottom: false, left: false });
    expect(dz).toBeGreaterThan(0);
    expect(dx).toBeLessThan(0);
    expect(Math.hypot(dx, dz)).toBeCloseTo(0.12, 5);
  });
});

describe("tileQuadCorners", () => {
  it("returns the 4 corners of a unit tile centered at (x, z)", () => {
    expect(tileQuadCorners(2.5, 4.5, 1)).toEqual({ x0: 2, x1: 3, z0: 4, z1: 5 });
  });

  it("scales with tile size", () => {
    expect(tileQuadCorners(0, 0, 2)).toEqual({ x0: -1, x1: 1, z0: -1, z1: 1 });
  });
});

describe("catenaryPoint", () => {
  const p0 = { x: 0, y: 0, z: 0 };
  const p1 = { x: 4, y: 0, z: 0 };

  it("starts exactly at p0 when t = 0", () => {
    expect(catenaryPoint(p0, p1, 0.5, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("ends exactly at p1 when t = 1", () => {
    const point = catenaryPoint(p0, p1, 0.5, 1);
    expect(point.x).toBeCloseTo(4);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });

  it("dips downward (sags) at the midpoint by roughly the sag amount", () => {
    const point = catenaryPoint(p0, p1, 0.5, 0.5);
    expect(point.x).toBeCloseTo(2);
    expect(point.y).toBeCloseTo(-0.5);
  });

  it("is a genuine curve, not a straight line -- midpoint y is well below the linear interpolation", () => {
    const linearMidY = (p0.y + p1.y) / 2;
    const curvedMidY = catenaryPoint(p0, p1, 0.5, 0.5).y;
    expect(curvedMidY).toBeLessThan(linearMidY);
  });

  it("interpolates x/z linearly along the span", () => {
    const point = catenaryPoint(p0, p1, 0.5, 0.25);
    expect(point.x).toBeCloseTo(1);
  });
});

describe("tetherSparkT", () => {
  it("is 0 at the start of a period", () => {
    expect(tetherSparkT(0, 1000)).toBe(0);
  });

  it("is 0.5 halfway through a period", () => {
    expect(tetherSparkT(500, 1000)).toBeCloseTo(0.5);
  });

  it("loops back to near 0 just past a full period", () => {
    expect(tetherSparkT(1000, 1000)).toBeCloseTo(0);
  });

  it("stays within [0, 1) for a much larger nowMs", () => {
    const t = tetherSparkT(1_234_567, 1800);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });
});
