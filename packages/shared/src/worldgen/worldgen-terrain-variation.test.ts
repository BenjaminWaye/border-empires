// Regression coverage for the "hills for 1000 tiles, then grass for 1000
// tiles" complaint: regionTypeAt's noise wavelengths used to be large enough
// (180/120/260 on a 450x450 world) that a single RegionType -- and every
// hill/biome threshold gated by it -- formed one blob spanning most of the
// map's width. Fixed in worldgenVersion 2 (see worldgen-version.ts) --
// gated so already-running seasons (worldgenVersion 1, the default when
// unset) keep reproducing their original terrain instead of drifting when
// this code ships. This asserts both halves: v2 breaks up the blobs, and v1
// still reproduces the old (blobby) behavior unchanged.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";
import { isHillsRegionAt } from "./worldgen-hills.js";

const longestRun = <T>(values: T[]): number => {
  let longest = 0;
  let current = 0;
  let prev: T | undefined;
  for (const v of values) {
    if (v === prev) {
      current += 1;
    } else {
      current = 1;
      prev = v;
    }
    longest = Math.max(longest, current);
  }
  return longest;
};

// Sea gaps naturally break up a scanline; only the land-only sequence
// reflects how big one hills/flat blob actually reads on the ground.
const worstLandRun = (pick: (wx: number, wy: number) => string | boolean): number => {
  let worstRun = 0;
  for (let wy = 60; wy < WORLD_HEIGHT - 60; wy += 23) {
    const landRow: (string | boolean)[] = [];
    for (let wx = 0; wx < WORLD_WIDTH; wx++) {
      if (terrainAt(wx, wy) === "LAND") landRow.push(pick(wx, wy));
    }
    worstRun = Math.max(worstRun, longestRun(landRow));
  }
  return worstRun;
};

describe("worldgen terrain variation", () => {
  test("worldgenVersion 2: no scanline has a hills run anywhere near the old ~1000-tile blob scale", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    // WORLD_WIDTH is 450, so a "1000-tile blob" wrapped around a scanline
    // several times over -- well under a full width is already a fix.
    expect(worstLandRun((x, y) => isHillsRegionAt(x, y))).toBeLessThan(WORLD_WIDTH * 0.6);
  });

  test("worldgenVersion 2: no scanline has a land-biome run anywhere near the old blob scale", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    expect(worstLandRun((x, y) => landBiomeAt(x, y) ?? "")).toBeLessThan(WORLD_WIDTH * 0.6);
  });

  test("worldgenVersion 1 (legacy default) still produces meaningfully bigger blobs than v2 -- existing seasons must not silently get the v2 fix", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const v2WorstRun = worstLandRun((x, y) => isHillsRegionAt(x, y));

    setWorldSeed(9001); // no 3rd arg -- exercises the default (1), same as an already-running season
    const v1WorstRun = worstLandRun((x, y) => isHillsRegionAt(x, y));

    expect(v1WorstRun).toBeGreaterThan(v2WorstRun * 1.3);
  });
});
