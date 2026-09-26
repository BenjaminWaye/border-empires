// v9 visual biome rules: GRASS splits into GRASSLAND (tropical belt) and
// PLAINS (everywhere else), and MARSH forms only around inland lakes and
// inland wetland patches -- never within reach of the ocean. All of it stays
// visual-only: landBiomeAt must keep returning the original 4 values.
import { beforeAll, describe, expect, test } from "vitest";
import { isLakeTileAt, landBiomeAt, setWorldSeed, terrainAt, visualLandBiomeAt } from "../index.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { latitudeOf } from "./worldgen-latitude.js";

const V9 = 9;
const ORIGINAL_BIOMES = new Set(["GRASS", "SAND", "COASTAL_SAND", "TUNDRA"]);
// grassClassAt's belt edge = 0.2 cutoff +- 0.07 noise wobble.
const GRASSLAND_MAX_LATITUDE = 0.2 + 0.07;

type Sample = { wx: number; wy: number; visual: string | undefined };
const samples: Sample[] = [];

describe("worldgen visual biomes (v9)", () => {
  beforeAll(() => {
    setWorldSeed(9001, "continents", V9);
    for (let wy = 0; wy < WORLD_HEIGHT; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) samples.push({ wx, wy, visual: visualLandBiomeAt(wx, wy) });
    }
  });

  test("plain GRASS is never emitted; GRASSLAND and PLAINS both are", () => {
    const seen = new Set(samples.map((s) => s.visual));
    expect(seen.has("GRASS")).toBe(false);
    expect(seen.has("GRASSLAND")).toBe(true);
    expect(seen.has("PLAINS")).toBe(true);
  });

  test("GRASSLAND only appears in the tropical belt, and outnumbers PLAINS there", () => {
    let tropicalGrassland = 0;
    let tropicalPlains = 0;
    for (const { wy, visual } of samples) {
      if (visual === "GRASSLAND") expect(latitudeOf(wy)).toBeLessThan(GRASSLAND_MAX_LATITUDE);
      if (latitudeOf(wy) >= 0.13) continue; // well inside the belt, past any edge wobble
      if (visual === "GRASSLAND") tropicalGrassland += 1;
      if (visual === "PLAINS") tropicalPlains += 1;
    }
    expect(tropicalPlains).toBeGreaterThan(0); // "plains also occur in the tropics, less often"
    expect(tropicalGrassland).toBeGreaterThan(tropicalPlains * 2);
  });

  test("MARSH never forms within 2 tiles of non-lake water, and some forms next to a lake", () => {
    let marshByLake = 0;
    for (const { wx, wy, visual } of samples) {
      if (visual !== "MARSH") continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const t = terrainAt(wx + dx, wy + dy);
          if (t !== "SEA" && t !== "COASTAL_SEA") continue;
          expect(isLakeTileAt(wx + dx, wy + dy)).toBe(true);
          marshByLake += 1;
        }
      }
    }
    expect(marshByLake).toBeGreaterThan(0);
  });

  test("landBiomeAt never returns a visual-only value", () => {
    for (const { wx, wy } of samples) {
      const mechanical = landBiomeAt(wx, wy);
      if (mechanical !== undefined) expect(ORIGINAL_BIOMES.has(mechanical)).toBe(true);
    }
  });
});
