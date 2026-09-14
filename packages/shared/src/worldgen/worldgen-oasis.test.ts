// Regression coverage for oasis landmarks (v8): a small SEA water pool with
// a ring of real, mechanically-GRASS (farmable) ground around it, scattered
// inside CRYSTAL_WASTES (desert) regions. Both effects are real terrain
// changes, not just rendering -- landBiomeAt itself must return GRASS on
// the ring, not just visualLandBiomeAt.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, getWorldSeed, landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";
import { oasisFeatureAt } from "./worldgen-oasis.js";

describe("worldgen oasis landmarks (v8)", () => {
  test("oasisFeatureAt finds WATER and RING tiles; at least one WATER tile is real SEA and every RING land tile is mechanical GRASS", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const seed = getWorldSeed();
    let sawWaterFeature = false;
    let sawRealSea = false;
    let sawRing = false;
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        const feature = oasisFeatureAt(wx, wy, seed, CURRENT_WORLDGEN_VERSION);
        if (feature === "WATER") {
          sawWaterFeature = true;
          // Edge water tiles get promoted back to LAND by the "shoreline is
          // capturable" rule (terrainAt), same as any small lake -- only
          // tiles far enough from the ring survive as real SEA.
          if (terrainAt(wx, wy) === "SEA") sawRealSea = true;
        } else if (feature === "RING" && terrainAt(wx, wy) === "LAND") {
          sawRing = true;
          expect(landBiomeAt(wx, wy)).toBe("GRASS");
        }
      }
    }
    expect(sawWaterFeature).toBe(true);
    expect(sawRealSea).toBe(true);
    expect(sawRing).toBe(true);
  });

  test("oasisFeatureAt never returns a feature under earlier worldgen versions", () => {
    setWorldSeed(9001, "continents", 7);
    const seed = getWorldSeed();
    let found = false;
    for (let wy = 0; wy < WORLD_HEIGHT && !found; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH && !found; wx += 2) {
        if (oasisFeatureAt(wx, wy, seed, 7) !== undefined) found = true;
      }
    }
    expect(found).toBe(false);
  });
});
