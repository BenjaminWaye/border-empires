// Regression coverage for the "hills for 1000 tiles, then grass for 1000
// tiles" complaint: regionTypeAt's noise wavelengths used to be large enough
// (180/120/260 on a 450x450 world) that a single RegionType -- and every
// hill/biome threshold gated by it -- formed one blob spanning most of the
// map's width. This asserts the longest unbroken run of "same hills state"
// or "same land biome" along a scanline stays well under that old scale, so
// a future change can't silently regrow the giant slabs.
import { describe, expect, test } from "vitest";
import { landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
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

describe("worldgen terrain variation", () => {
  test("no scanline has a hills run anywhere near the old ~1000-tile blob scale", () => {
    setWorldSeed(9001);
    let worstRun = 0;
    for (let wy = 60; wy < WORLD_HEIGHT - 60; wy += 23) {
      // Sea gaps naturally break up a scanline; only the land-only sequence
      // reflects how big one hills/flat blob actually reads on the ground.
      const landRow: boolean[] = [];
      for (let wx = 0; wx < WORLD_WIDTH; wx++) {
        if (terrainAt(wx, wy) === "LAND") landRow.push(isHillsRegionAt(wx, wy));
      }
      worstRun = Math.max(worstRun, longestRun(landRow));
    }
    // WORLD_WIDTH is 450, so a "1000-tile blob" wrapped around a scanline
    // several times over -- well under a full width is already a fix.
    expect(worstRun).toBeLessThan(WORLD_WIDTH * 0.6);
  });

  test("no scanline has a land-biome run anywhere near the old blob scale", () => {
    setWorldSeed(9001);
    let worstRun = 0;
    for (let wy = 60; wy < WORLD_HEIGHT - 60; wy += 23) {
      const landRow: string[] = [];
      for (let wx = 0; wx < WORLD_WIDTH; wx++) {
        if (terrainAt(wx, wy) === "LAND") landRow.push(landBiomeAt(wx, wy) ?? "");
      }
      worstRun = Math.max(worstRun, longestRun(landRow));
    }
    expect(worstRun).toBeLessThan(WORLD_WIDTH * 0.6);
  });
});
