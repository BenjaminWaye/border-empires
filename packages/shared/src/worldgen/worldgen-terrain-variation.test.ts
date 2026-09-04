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
import { CURRENT_WORLDGEN_VERSION, grassShadeAt, landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
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

  // v2 (#1831) broke up hills/biome regions into smaller *shapes* but never
  // touched the SAND/GRASS and forest-DARK/LIGHT thresholds, and those
  // thresholds were tuned as if the underlying noise field were spread
  // evenly across [0, 1) when in practice it clusters near 0.5 and changes
  // slowly tile-to-tile -- so v2 still produced patches tens of tiles wide
  // that read as one dominant color. v3 fixes the actual cause: it blends in
  // a small-cell "mottle" noise octave (see worldgen-biome-thresholds.ts)
  // so SAND/GRASS, forest DARK/LIGHT, and hills all flip within a handful of
  // tiles -- a "no tile identical to its neighbors for more than a few tiles"
  // texture, closer to how Civilization-style terrain reads -- instead of
  // smoothly drifting across dozens of tiles. This measures the average
  // scanline run length (how many consecutive same-value tiles in a row)
  // for each of those three fields and asserts v3 is dramatically shorter
  // than v2, while v1/v2 (legacy, already-running seasons) are unaffected.
  const meanLandRunLength = (pick: (wx: number, wy: number) => string): number => {
    const lens: number[] = [];
    for (let wy = 60; wy < WORLD_HEIGHT - 60; wy += 5) {
      let prev: string | undefined;
      let run = 0;
      for (let wx = 0; wx < WORLD_WIDTH; wx++) {
        if (terrainAt(wx, wy) !== "LAND") {
          if (run > 0) lens.push(run);
          prev = undefined;
          run = 0;
          continue;
        }
        const v = pick(wx, wy);
        if (v === prev) run++;
        else {
          if (run > 0) lens.push(run);
          run = 1;
          prev = v;
        }
      }
      if (run > 0) lens.push(run);
    }
    return lens.reduce((a, b) => a + b, 0) / lens.length;
  };

  test("worldgenVersion 3: biome/hills/forest-shade scanline runs average well under 10 tiles", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    expect(meanLandRunLength((x, y) => landBiomeAt(x, y) ?? "")).toBeLessThan(8);
    expect(meanLandRunLength((x, y) => String(isHillsRegionAt(x, y)))).toBeLessThan(8);
    expect(meanLandRunLength((x, y) => grassShadeAt(x, y) ?? "")).toBeLessThan(8);
  });

  test("worldgenVersion 2 (legacy) still has meaningfully longer runs than v3", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const v3Mean = meanLandRunLength((x, y) => landBiomeAt(x, y) ?? "");

    setWorldSeed(9001, "continents", 2);
    const v2Mean = meanLandRunLength((x, y) => landBiomeAt(x, y) ?? "");

    expect(v2Mean).toBeGreaterThan(v3Mean * 2);
  });
});
