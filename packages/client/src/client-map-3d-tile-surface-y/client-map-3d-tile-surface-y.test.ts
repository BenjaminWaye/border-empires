import { describe, expect, it } from "vitest";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight } from "../client-map-3d-hill-shape.js";
import { tileCornerYs, tileSurfaceHeights, type TileSurfaceInputs } from "./client-map-3d-tile-surface-y.js";

const RISE = 0.012;
const GROUND = 0.3;

const inputsFor = (hillTiles: ReadonlySet<string>, wx: number, wy: number): TileSurfaceInputs => {
  const isHillsAt = (x: number, y: number): boolean => hillTiles.has(`${x},${y}`);
  return {
    heightfield: {
      // Base elevation of a hill tile bakes in the full bonus (heightfield sampleTile).
      elevationAt: (x, y) => GROUND + (isHillsAt(x, y) ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0),
      cornerYAt: () => GROUND
    },
    wx,
    wy,
    wxNext: wx + 1,
    wyNext: wy + 1,
    rise: RISE,
    isHillsAt,
    wrapX: (x) => x,
    wrapY: (y) => y,
    roadDirsAt: () => undefined
  };
};

describe("tileSurfaceHeights", () => {
  it("keeps flat overlays on non-hill tiles at the shared surface height", () => {
    const heights = tileSurfaceHeights(inputsFor(new Set(), 5, 5));
    expect(heights.flatOverlayY).toBe(heights.surfaceY);
    expect(heights.surfaceY).toBeCloseTo(GROUND + RISE, 6);
  });

  it("places flat overlays on a hill tile at the rendered dome centre, not the bonus peak", () => {
    const hills = new Set(["5,5"]);
    const inputs = inputsFor(hills, 5, 5);
    const heights = tileSurfaceHeights(inputs);
    const bumps = hillBumpsWithCorridorAt(5, 5, hillNeighborFlagsAt(5, 5, inputs.isHillsAt, inputs.wrapX, inputs.wrapY));
    const expected = GROUND + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(0, 0, bumps, 5, 5) + RISE;
    expect(heights.flatOverlayY).toBeCloseTo(expected, 6);
    // Props keep the highest-point height; the flat overlay must be clearly lower (it used to float).
    expect(heights.surfaceY).toBeCloseTo(GROUND + HEIGHTFIELD_HILLS_ELEVATION_BONUS + RISE, 6);
    expect(heights.surfaceY - heights.flatOverlayY).toBeGreaterThan(0.15);
    expect(heights.flatOverlayY).toBeGreaterThan(GROUND);
  });
});

describe("tileCornerYs", () => {
  it("samples the four corners (wrapped neighbours included) and lifts each by rise", () => {
    const heightfield = { cornerYAt: (x: number, y: number) => x * 10 + y };
    expect(tileCornerYs(heightfield, 3, 4, 0, 5, 0.5)).toEqual({
      corner00Y: 34.5,
      corner10Y: 4.5,
      corner01Y: 35.5,
      corner11Y: 5.5
    });
  });
});
