import { describe, expect, test } from "vitest";
import { continentIdAt, grassShadeAt, landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";

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

  test("places TUNDRA land tiles near the polar mountain band but never at the equator", () => {
    setWorldSeed(2024);

    const rowLandBiomes = (wy: number): (import("../types.js").LandBiome | undefined)[] =>
      Array.from({ length: WORLD_WIDTH }, (_, wx) => terrainAt(wx, wy) === "LAND" ? landBiomeAt(wx, wy) : undefined);

    // Rows just past the fixed polar mountain band (wy < 15 forces MOUNTAIN)
    // should include some TUNDRA land tiles.
    const nearNorthPole = rowLandBiomes(20);
    const nearSouthPole = rowLandBiomes(WORLD_HEIGHT - 20);
    expect(nearNorthPole.some((b) => b === "TUNDRA") || nearSouthPole.some((b) => b === "TUNDRA")).toBe(true);

    // The equator row is far outside the cold band and should never resolve to TUNDRA.
    const equator = rowLandBiomes(Math.floor(WORLD_HEIGHT / 2));
    expect(equator.every((b) => b !== "TUNDRA")).toBe(true);
  });

  test("grassShadeAt is undefined for a TUNDRA-forced coordinate", () => {
    setWorldSeed(2024);

    let tundraCoord: [number, number] | undefined;
    for (let wx = 0; wx < WORLD_WIDTH && !tundraCoord; wx++) {
      if (terrainAt(wx, 20) === "LAND" && landBiomeAt(wx, 20) === "TUNDRA") tundraCoord = [wx, 20];
    }
    expect(tundraCoord).toBeDefined();
    const [wx, wy] = tundraCoord!;
    expect(grassShadeAt(wx, wy)).toBeUndefined();
  });
});
