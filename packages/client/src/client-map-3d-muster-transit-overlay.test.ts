import { describe, expect, it } from "vitest";
import { tileWalkPath } from "./client-map-3d-muster-transit-overlay.js";

describe("tileWalkPath", () => {
  it("walks a straight horizontal line one tile at a time", () => {
    const path = tileWalkPath(0, 0, 4, 0);
    expect(path).toEqual([
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 }
    ]);
  });

  it("walks diagonally (king-move) when both axes differ, never skipping a tile", () => {
    const path = tileWalkPath(0, 0, 3, 3);
    expect(path).toEqual([
      { x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: 3, z: 3 }
    ]);
  });

  it("staircases when one axis is longer than the other, never leaving a >1-tile gap between consecutive points", () => {
    const path = tileWalkPath(0, 0, 5, 2);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z))).toBe(1);
    }
    expect(path[0]).toEqual({ x: 0, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 5, z: 2 });
  });

  it("falls back to a straight two-point line when the walk would exceed maxSteps", () => {
    const path = tileWalkPath(0, 0, 100, 0, 10);
    expect(path).toEqual([{ x: 0, z: 0 }, { x: 100, z: 0 }]);
  });

  it("returns a single-point path when start and end coincide", () => {
    expect(tileWalkPath(5, 5, 5, 5)).toEqual([{ x: 5, z: 5 }]);
  });
});
