import { describe, expect, it } from "vitest";
import {
  coastCornerBeachMix,
  coastCornerDiagonalBias,
  coastCornerDiagonalElevationBias,
  elevationJitter,
  heightfieldTileBaseElevation,
  heightfieldTileColor,
  HEIGHTFIELD_GRASS_ELEVATION,
  HEIGHTFIELD_TUNDRA_ELEVATION,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield-terrain.js";

const V8_KINDS: HeightfieldTerrainKind[] = ["PLAINS", "JUNGLE", "MARSH", "SNOW"];

describe("client-map-3d-heightfield-terrain v8 biome kinds", () => {
  it("PLAINS/JUNGLE/MARSH sit at GRASS elevation and SNOW sits at TUNDRA elevation", () => {
    expect(heightfieldTileBaseElevation("PLAINS")).toBe(HEIGHTFIELD_GRASS_ELEVATION);
    expect(heightfieldTileBaseElevation("JUNGLE")).toBe(HEIGHTFIELD_GRASS_ELEVATION);
    expect(heightfieldTileBaseElevation("MARSH")).toBe(HEIGHTFIELD_GRASS_ELEVATION);
    expect(heightfieldTileBaseElevation("SNOW")).toBe(HEIGHTFIELD_TUNDRA_ELEVATION);
  });

  it("every v8 kind returns a distinct, valid RGB color for every shade variant", () => {
    const colorsSeen = new Set<string>();
    for (const kind of V8_KINDS) {
      for (const variant of [0, 1, 2] as const) {
        const [r, g, b] = heightfieldTileColor(kind, variant);
        for (const channel of [r, g, b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
        colorsSeen.add(`${kind}:${r},${g},${b}`);
      }
    }
    // PLAINS/JUNGLE/MARSH each have 2 distinct colors (variant 0/2 share one);
    // SNOW is a single flat tint regardless of variant (checked separately
    // below) -- 3*2 + 1 = 7.
    expect(colorsSeen.size).toBeGreaterThanOrEqual(7);
  });

  it("SNOW is a single flat tint (no variant-based light/dark split, unlike the others)", () => {
    const [r0, g0, b0] = heightfieldTileColor("SNOW", 0);
    const [r1, g1, b1] = heightfieldTileColor("SNOW", 1);
    expect([r0, g0, b0]).toEqual([r1, g1, b1]);
  });

  it("flat-land jitter (including the rolling-terrain wave) stays small enough to never overtake the hills bonus", () => {
    // HEIGHTFIELD_HILLS_ELEVATION_BONUS is 0.45 -- the coastal-hill-corner
    // regression test in client-map-3d-heightfield.test.ts depends on flat
    // jitter staying well under that, so a future amplitude bump here should
    // trip this first rather than a confusing failure over there.
    for (let wx = 0; wx < 60; wx += 1) {
      for (let wy = 0; wy < 60; wy += 1) {
        expect(Math.abs(elevationJitter(wx, wy, "GRASS"))).toBeLessThan(0.1);
      }
    }
  });
});

describe("coastCornerDiagonalBias (diagonal land/sea checkerboard connectivity)", () => {
  it("biases beachMix toward land at a diagonal-checkerboard corner (land at s00+s11, sea at s10+s01)", () => {
    // Same landCount=2/seaCount=2 ratio as any other coast corner -- only the
    // arrangement (diagonal vs. adjacent) differs.
    const wobble = 0.5; // neutral, isolates the diagonal bias itself
    const normalBeachMix = Math.min(
      1,
      Math.max(0, coastCornerBeachMix(2, 4, wobble) + coastCornerDiagonalBias(true, false, true, false))
    );
    const diagonalBeachMix = Math.min(
      1,
      Math.max(0, coastCornerBeachMix(2, 4, wobble) + coastCornerDiagonalBias(true, false, false, true))
    );
    expect(diagonalBeachMix).toBeLessThan(normalBeachMix);
  });

  it("recognizes both diagonal orientations (s00+s11 land, or s10+s01 land) as a land bridge", () => {
    expect(coastCornerDiagonalBias(true, false, false, true)).toBeLessThan(0);
    expect(coastCornerDiagonalBias(false, true, true, false)).toBeLessThan(0);
  });

  it("does not bias a normal (adjacent-tiles) coast corner with the same 2-land/2-sea ratio", () => {
    // Land on one side (s00+s10), sea on the other (s01+s11) -- a straight
    // coastline segment, not a diagonal checkerboard.
    expect(coastCornerDiagonalBias(true, true, false, false)).toBe(0);
    // Land on adjacent tiles s00+s01 (sharing an edge, not a diagonal) is
    // also a normal coast corner.
    expect(coastCornerDiagonalBias(true, false, true, false)).toBe(0);
  });

  it("also pulls the diagonal corner's elevation up relative to a normal coast corner", () => {
    expect(coastCornerDiagonalElevationBias(true, false, false, true)).toBeGreaterThan(0);
    expect(coastCornerDiagonalElevationBias(true, true, false, false)).toBe(0);
  });
});
