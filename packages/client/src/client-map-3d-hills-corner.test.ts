import { describe, expect, it } from "vitest";
import { createFlatCornerResolver } from "./client-map-3d-hills-corner.js";
import { coastWobbleAt } from "./client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import {
  coastCornerElevationWobbled,
  heightfieldFlatTileElevation,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  COAST_EDGE_Y,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

// Regression for the hill-tile-vs-coast seam: a hill dome's edge corner is
// stitched by averaging its 4 surrounding tiles (see flatCorner's own
// comment in client-map-3d-hills-corner.ts), but the main grid pins a
// corner touching sea to COAST_EDGE_Y (see coastCornerElevation) instead of
// a plain average — sea is never counted as "flat land" so a naive average
// never sees it. Before this fix, a corner where a hill meets the coast
// used the plain land average while the main grid's own matching corner
// used the coastal pin, and the two disagreed: the dome edge sat above the
// real coast level with its underside/skirt showing through as a black
// seam right at the hill/coast border.
describe("hills dome flatCorner at a hill/coast corner", () => {
  const worldWidth = 450;
  const worldHeight = 450;
  const wrap = (n: number, dim: number): number => ((n % dim) + dim) % dim;

  // Corner (1,1) touches: (0,0) a hill, (1,0) sea, (0,1) and (1,1) grass.
  const kindAt = (wx: number, wy: number): HeightfieldTerrainKind => (wx === 1 && wy === 0 ? "SEA" : "GRASS");
  const isHillsAt = (wx: number, wy: number): boolean => wx === 0 && wy === 0;
  const exploredAt = (): boolean => true;

  it("pins the corner to the main grid's coastal elevation, not a plain land average", () => {
    const flatCorner = createFlatCornerResolver({ worldWidth, worldHeight, wrap, tileKindAt: kindAt, exploredAt, isHillsAt });

    const result = flatCorner(1, 1, { e: 0, r: 0, g: 0, b: 0, t: 0 });

    const hillCell = { elevation: heightfieldFlatTileElevation(0, 0, "GRASS") + HEIGHTFIELD_HILLS_ELEVATION_BONUS, isExplored: true, isHills: true };
    const seaCell = { elevation: 0, isExplored: true, isHills: false };
    const grassCell = { elevation: heightfieldFlatTileElevation(0, 1, "GRASS"), isExplored: true, isHills: false };
    const grassCell2 = { elevation: heightfieldFlatTileElevation(1, 1, "GRASS"), isExplored: true, isHills: false };
    const wobble = coastWobbleAt(1, 1);
    const expectedE = coastCornerElevationWobbled(hillCell, seaCell, grassCell, grassCell2, COAST_EDGE_Y, wobble);

    // The old, broken formula: average only the countsAsFlatLand neighbours
    // (the two grass tiles), completely ignoring the sea and the hill.
    const naiveAverage = (heightfieldFlatTileElevation(0, 1, "GRASS") + heightfieldFlatTileElevation(1, 1, "GRASS")) / 2;

    expect(result.e).toBeCloseTo(expectedE, 10);
    expect(result.e).not.toBeCloseTo(naiveAverage, 3);
  });
});
