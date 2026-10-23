import { describe, expect, it } from "vitest";
import { fitNamePathToTiles } from "./client-name-path-fit.js";

const path = { text: "Waypoint", points: [{ x: 0, y: 5 }, { x: 20, y: 5 }], heightTiles: 4, spanTiles: 22 };
/** A band of tiles x 0..20, y 3..7 (five rows thick). */
const band = (x: number, y: number): boolean => x >= 0 && x <= 20 && y >= 3 && y <= 7;

describe("fitNamePathToTiles", () => {
  it("keeps a path that fits, capping the letters to the band's thickness", () => {
    const fitted = fitNamePathToTiles(path, band)!;
    // The 1-tile rim each side runs off the band (x -1 and 21), so the name keeps to x 0..20.
    expect(fitted.spanTiles).toBeCloseTo(20.5, 0);
    // Two and a half tiles each side of the centre row, minus the margin.
    expect(fitted.heightTiles).toBeLessThanOrEqual(5);
    expect(fitted.heightTiles).toBeGreaterThan(3.5);
  });

  it("shrinks the letters to a thin strip", () => {
    const strip = (x: number, y: number): boolean => x >= 0 && x <= 20 && y === 5;
    const fitted = fitNamePathToTiles(path, strip)!;
    expect(fitted.heightTiles).toBeLessThanOrEqual(1);
  });

  it("compacts the name into the longest stretch inside", () => {
    const gappy = (x: number, y: number): boolean => band(x, y) && ((x >= 0 && x <= 4) || (x >= 8 && x <= 17));
    const fitted = fitNamePathToTiles(path, gappy)!;
    const xs = fitted.points.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(7.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(17.5);
    expect(fitted.spanTiles).toBeCloseTo(Math.max(...xs) - Math.min(...xs));
  });

  it("uses the rim at the ends when those tiles are inside too", () => {
    const wide = (x: number, y: number): boolean => x >= -1 && x <= 21 && y >= 3 && y <= 7;
    expect(fitNamePathToTiles(path, wide)!.spanTiles).toBeCloseTo(22);
  });

  it("drops a name with almost nothing inside", () => {
    expect(fitNamePathToTiles(path, (x, y) => x === 3 && y === 5)).toBeUndefined();
    expect(fitNamePathToTiles(path, () => false)).toBeUndefined();
  });
});
