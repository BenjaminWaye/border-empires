import { describe, expect, it } from "vitest";
import { ownershipQuadCornersClampedAwayFromMountain } from "./client-map-3d-ownership-mountain-clamp.js";
import type { Tile } from "../client-types.js";

const identity = (n: number): number => n;

describe("ownershipQuadCornersClampedAwayFromMountain", () => {
  // Regression: a claimed LAND tile bordering a MOUNTAIN used to trace the
  // mountain's much taller shared corner height, bridging flat ground up to
  // mountain height on that edge. Rendered, that steep quad read as a thick
  // green line/wall across the mountain's base ("thick green line on
  // mountains" bug) instead of a flat tint on the ground.
  it("clamps corners shared with a MOUNTAIN neighbor down to this tile's own flat height", () => {
    const terrainAt = (wx: number, wy: number): Tile["terrain"] => (wx === 1 && wy === -1 ? "MOUNTAIN" : "LAND");
    // A raw heightfield corner near the mountain would read much taller
    // than the flat ground elsewhere.
    const cornerYAt = (cornerX: number, cornerY: number): number => (cornerX >= 1 && cornerY <= 0 ? 5 : 0.1);
    const elevationAt = (): number => 0.1;

    const corners = ownershipQuadCornersClampedAwayFromMountain(
      0, 0, 1, 1, identity, identity, terrainAt, cornerYAt, elevationAt, 0.022
    );

    // corner10 (1,0) touches the (1,-1) MOUNTAIN neighbor diagonally and
    // should be clamped to the tile's own flat height instead of the
    // mountain-height reading.
    expect(corners.corner10Y).toBeCloseTo(0.1 + 0.022);
    // corner00, corner01, corner11 don't border the mountain and keep
    // their real (flat, here) heightfield reading.
    expect(corners.corner00Y).toBeCloseTo(0.1 + 0.022);
    expect(corners.corner01Y).toBeCloseTo(0.1 + 0.022);
    expect(corners.corner11Y).toBeCloseTo(0.1 + 0.022);
  });

  it("leaves corners untouched when no neighbor is a mountain", () => {
    const terrainAt = (): Tile["terrain"] => "LAND";
    const cornerYAt = (cornerX: number, cornerY: number): number => cornerX + cornerY;
    const elevationAt = (): number => 0;

    const corners = ownershipQuadCornersClampedAwayFromMountain(
      2, 3, 3, 4, identity, identity, terrainAt, cornerYAt, elevationAt, 0
    );

    expect(corners.corner00Y).toBeCloseTo(5);
    expect(corners.corner10Y).toBeCloseTo(6);
    expect(corners.corner01Y).toBeCloseTo(6);
    expect(corners.corner11Y).toBeCloseTo(7);
  });
});
