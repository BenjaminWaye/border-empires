import { describe, expect, it } from "vitest";
import { clipNamePathToExplored } from "./client-name-path-explored-clip.js";

const path = { text: "Waypoint", points: [{ x: 0, y: 5 }, { x: 20, y: 5 }], heightTiles: 2, spanTiles: 22 };

describe("clipNamePathToExplored", () => {
  it("leaves a fully explored path alone", () => {
    expect(clipNamePathToExplored(path, () => true)).toBe(path);
  });

  it("compacts the name into the longest explored stretch", () => {
    // Explored: x 0..4 and x 8..17; the longer stretch wins.
    const clipped = clipNamePathToExplored(path, (x) => (x >= 0 && x <= 4) || (x >= 8 && x <= 17))!;
    const xs = clipped.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(7.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(17.5);
    expect(clipped.spanTiles).toBeLessThan(path.spanTiles);
    expect(clipped.spanTiles).toBeCloseTo(Math.max(...xs) - Math.min(...xs));
  });

  it("drops a name with almost nothing explored under it", () => {
    expect(clipNamePathToExplored(path, (x) => x === 3)).toBeUndefined();
    expect(clipNamePathToExplored(path, () => false)).toBeUndefined();
  });
});
