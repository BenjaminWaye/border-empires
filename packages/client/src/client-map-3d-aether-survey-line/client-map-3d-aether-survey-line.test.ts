import { describe, expect, it } from "vitest";
import { lerpPoint, tileQuadCorners } from "./client-map-3d-aether-survey-line.js";

describe("tileQuadCorners", () => {
  it("returns the 4 corners of a unit tile centered at (x, z)", () => {
    expect(tileQuadCorners(0, 0, 1)).toEqual({ x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 });
  });

  it("scales with size", () => {
    expect(tileQuadCorners(10, 20, 2)).toEqual({ x0: 9, x1: 11, z0: 19, z1: 21 });
  });
});

describe("lerpPoint", () => {
  it("returns p0 at t=0 and p1 at t=1", () => {
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 10, y: 2, z: -4 };
    expect(lerpPoint(p0, p1, 0)).toEqual(p0);
    expect(lerpPoint(p0, p1, 1)).toEqual(p1);
  });

  it("interpolates linearly at the midpoint", () => {
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 10, y: 4, z: -2 };
    expect(lerpPoint(p0, p1, 0.5)).toEqual({ x: 5, y: 2, z: -1 });
  });
});
