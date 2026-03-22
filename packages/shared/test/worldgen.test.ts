import { describe, expect, test } from "vitest";
import { continentIdAt, grassShadeAt, landBiomeAt, setWorldSeed, terrainAt } from "../src/index.js";

describe("worldgen", () => {
  test("reuses cached results without changing output", () => {
    setWorldSeed(12345);
    const firstTerrain = terrainAt(17, 29);
    const firstBiome = landBiomeAt(17, 29);
    const firstShade = grassShadeAt(17, 29);
    const firstContinent = continentIdAt(17, 29);

    expect(terrainAt(17, 29)).toBe(firstTerrain);
    expect(landBiomeAt(17, 29)).toBe(firstBiome);
    expect(grassShadeAt(17, 29)).toBe(firstShade);
    expect(continentIdAt(17, 29)).toBe(firstContinent);
  });

  test("resets derived caches when the world seed changes", () => {
    setWorldSeed(42);
    const before = Array.from({ length: 32 }, (_, i) => ({
      terrain: terrainAt(i * 7, i * 11),
      biome: landBiomeAt(i * 7, i * 11),
      shade: grassShadeAt(i * 7, i * 11),
      continent: continentIdAt(i * 7, i * 11)
    }));

    setWorldSeed(314159);
    const after = Array.from({ length: 32 }, (_, i) => ({
      terrain: terrainAt(i * 7, i * 11),
      biome: landBiomeAt(i * 7, i * 11),
      shade: grassShadeAt(i * 7, i * 11),
      continent: continentIdAt(i * 7, i * 11)
    }));

    expect(after).not.toEqual(before);
  });
});
