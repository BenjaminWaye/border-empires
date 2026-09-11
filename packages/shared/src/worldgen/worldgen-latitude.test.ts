// Regression coverage for the latitude-based climate bias (worldgenVersion
// 7): the equatorial belt should skew wetter (more DEEP_FOREST/FERTILE_PLAINS,
// less arid SAND), the subtropical desert belt should skew more arid than
// either the equator or the temperate band, matching Earth's real climate
// bands -- and none of this should apply to earlier worldgen versions.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, landBiomeAt, regionTypeAt, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";
import { isTropicalForestTileAt } from "../forest-terrain/forest-terrain.js";

// Rows at a given latitude band (0 = equator, 1 = pole), both above and
// below the equator since the map is symmetric north/south.
const rowsForLatitudeBand = (loLatitude: number, hiLatitude: number): number[] => {
  const rows: number[] = [];
  const half = WORLD_HEIGHT / 2;
  for (let wy = 0; wy < WORLD_HEIGHT; wy++) {
    const latitude = Math.abs(wy - half) / half;
    if (latitude >= loLatitude && latitude < hiLatitude) rows.push(wy);
  }
  return rows;
};

const aridShareForRows = (rows: number[]): number => {
  let land = 0;
  let arid = 0;
  for (const wy of rows) {
    for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
      if (terrainAt(wx, wy) !== "LAND") continue;
      land++;
      const region = regionTypeAt(wx, wy);
      if (landBiomeAt(wx, wy) === "SAND" || region === "CRYSTAL_WASTES" || region === "ANCIENT_HEARTLAND") arid++;
    }
  }
  return land === 0 ? 0 : arid / land;
};

describe("worldgen latitude climate bands (v7)", () => {
  test("the subtropical desert belt is more arid than the equatorial belt under v7", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const equatorRows = rowsForLatitudeBand(0, 0.12);
    const desertBeltRows = rowsForLatitudeBand(0.24, 0.36);
    const equatorArid = aridShareForRows(equatorRows);
    const desertBeltArid = aridShareForRows(desertBeltRows);
    expect(desertBeltArid).toBeGreaterThan(equatorArid);
  });

  test("latitude has no effect on region selection under earlier worldgen versions", () => {
    setWorldSeed(9001, "continents", 6);
    const equatorRows = rowsForLatitudeBand(0, 0.12);
    const desertBeltRows = rowsForLatitudeBand(0.24, 0.36);
    const equatorArid = aridShareForRows(equatorRows);
    const desertBeltArid = aridShareForRows(desertBeltRows);
    // Without a latitude bias the two bands should be statistically similar
    // (noise-driven only) -- allow generous slack since it's still a
    // relatively small, seed-dependent sample.
    expect(Math.abs(desertBeltArid - equatorArid)).toBeLessThan(0.15);
  });

  test("tropical forest tiles only appear in the equatorial belt under v7", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    let foundTropical = false;
    let anyOutsideBelt = false;
    const half = WORLD_HEIGHT / 2;
    for (let wy = 40; wy < WORLD_HEIGHT - 40; wy++) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        if (!isTropicalForestTileAt(wx, wy)) continue;
        foundTropical = true;
        const latitude = Math.abs(wy - half) / half;
        if (latitude >= 0.2) anyOutsideBelt = true;
      }
    }
    expect(foundTropical).toBe(true);
    expect(anyOutsideBelt).toBe(false);
  });

  // The "arid" metric above (SAND biome OR CRYSTAL_WASTES/ANCIENT_HEARTLAND
  // region) is easy to satisfy just by shifting which region gets picked --
  // v7's first cut did exactly that but left the SAND *threshold* itself
  // unbiased, so the belt was statistically more "arid region" but visually
  // almost indistinguishable (~15-22% literal SAND tiles everywhere, no
  // real concentration). This checks the thing a player actually sees: the
  // literal SAND biome share, which needed the threshold itself biased by
  // latitude (see sandThresholdFor in worldgen-biome-thresholds.ts) to
  // produce a real difference.
  const sandShareForRows = (rows: number[]): number => {
    let land = 0;
    let sand = 0;
    for (const wy of rows) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        if (terrainAt(wx, wy) !== "LAND") continue;
        land++;
        if (landBiomeAt(wx, wy) === "SAND") sand++;
      }
    }
    return land === 0 ? 0 : sand / land;
  };

  test("the desert belt is visibly sandier (literal SAND tiles) than the equator or temperate zone under v7", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const equatorShare = sandShareForRows(rowsForLatitudeBand(0, 0.12));
    const desertBeltShare = sandShareForRows(rowsForLatitudeBand(0.24, 0.36));
    const temperateShare = sandShareForRows(rowsForLatitudeBand(0.5, 0.65));
    expect(desertBeltShare).toBeGreaterThan(equatorShare * 1.5);
    expect(desertBeltShare).toBeGreaterThan(temperateShare * 1.5);
  });

  test("tropical forest tiles never appear under earlier worldgen versions", () => {
    setWorldSeed(9001, "continents", 6);
    let foundTropical = false;
    for (let wy = 40; wy < WORLD_HEIGHT - 40; wy += 2) {
      for (let wx = 0; wx < WORLD_WIDTH; wx += 2) {
        if (isTropicalForestTileAt(wx, wy)) foundTropical = true;
      }
    }
    expect(foundTropical).toBe(false);
  });
});
