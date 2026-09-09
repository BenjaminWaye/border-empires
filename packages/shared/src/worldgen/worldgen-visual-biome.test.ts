// Regression coverage for v8's visual-only biome promotions (PLAINS/JUNGLE/
// MARSH/SNOW). The key invariant: landBiomeAt itself must never return one
// of these -- every existing gameplay consumer (FARM/UMBRITE placement,
// town type, forest/hills detection) keeps calling landBiomeAt directly and
// must keep seeing only the original 4 values, regardless of what
// visualLandBiomeAt shows for rendering.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, landBiomeAt, setWorldSeed, terrainAt, visualLandBiomeAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";

const ORIGINAL_BIOMES = new Set(["GRASS", "SAND", "COASTAL_SAND", "TUNDRA"]);

describe("worldgen visual biome promotions (v8)", () => {
  test("landBiomeAt never returns a v8 visual-only value, even when visualLandBiomeAt does", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    let sawVisualPromotion = false;
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 3) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 3) {
        if (terrainAt(wx, wy) !== "LAND") continue;
        const mechanical = landBiomeAt(wx, wy);
        if (mechanical !== undefined) expect(ORIGINAL_BIOMES.has(mechanical)).toBe(true);
        const visual = visualLandBiomeAt(wx, wy);
        if (visual !== undefined && !ORIGINAL_BIOMES.has(visual)) sawVisualPromotion = true;
      }
    }
    expect(sawVisualPromotion).toBe(true);
  });

  test("visualLandBiomeAt matches landBiomeAt exactly under earlier worldgen versions", () => {
    setWorldSeed(9001, "continents", 7);
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 5) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 5) {
        expect(visualLandBiomeAt(wx, wy)).toBe(landBiomeAt(wx, wy));
      }
    }
  });

  test("SNOW only appears where the mechanical biome is TUNDRA", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    let foundSnow = false;
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        if (visualLandBiomeAt(wx, wy) !== "SNOW") continue;
        foundSnow = true;
        expect(landBiomeAt(wx, wy)).toBe("TUNDRA");
      }
    }
    expect(foundSnow).toBe(true);
  });

  test("PLAINS and MARSH both appear, and only where the mechanical biome is GRASS", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    let foundPlains = false;
    let foundMarsh = false;
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        const visual = visualLandBiomeAt(wx, wy);
        if (visual === "PLAINS") {
          foundPlains = true;
          expect(landBiomeAt(wx, wy)).toBe("GRASS");
        } else if (visual === "MARSH") {
          foundMarsh = true;
          expect(landBiomeAt(wx, wy)).toBe("GRASS");
        }
      }
    }
    expect(foundPlains).toBe(true);
    expect(foundMarsh).toBe(true);
  });

  test("JUNGLE only appears where the mechanical biome is GRASS", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    let foundJungle = false;
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        if (visualLandBiomeAt(wx, wy) !== "JUNGLE") continue;
        foundJungle = true;
        expect(landBiomeAt(wx, wy)).toBe("GRASS");
      }
    }
    expect(foundJungle).toBe(true);
  });
});
