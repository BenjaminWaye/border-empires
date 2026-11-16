// Regression: once a lake cell's candidates are resolved (and their
// extremities/steps validated inland), testing more tiles against them must
// not call continentFieldAt again. The per-tile re-checks used fractional,
// off-map points that miss the per-tile continent-score cache, so every tile
// re-ran full continent-score work and the client's first terrain query (the
// whole-map coastal-cleanup pass) froze login for ~25s on production's world.
import { describe, expect, test } from "vitest";
import { isLakeAt } from "./worldgen-lakes.js";

const LAKE_CELL = 52;

describe("isLakeAt inland queries", () => {
  test("tiles after the first in a cell block reuse the validated candidates", () => {
    const seed = 377720878;
    // Unique threshold so this test owns a fresh lake-cell cache.
    const threshold = 0.123456;
    let calls = 0;
    const alwaysInland = (): number => {
      calls += 1;
      return 1;
    };
    let lakeTiles = 0;
    let callsAfterResolve = 0;
    for (let gx = 1; gx < 5; gx += 1) {
      for (let gy = 1; gy < 4; gy += 1) {
        const originX = gx * LAKE_CELL;
        const originY = gy * LAKE_CELL;
        // Pass 1 resolves (and validates) every candidate cell these tiles
        // reach; pass 2 repeats the same queries and must not need the field.
        for (let y = originY; y < originY + LAKE_CELL; y += 1) {
          for (let x = originX; x < originX + LAKE_CELL; x += 1) isLakeAt(x, y, seed, 12, alwaysInland, threshold);
        }
        calls = 0;
        for (let y = originY; y < originY + LAKE_CELL; y += 1) {
          for (let x = originX; x < originX + LAKE_CELL; x += 1) {
            if (isLakeAt(x, y, seed, 12, alwaysInland, threshold)) lakeTiles += 1;
          }
        }
        callsAfterResolve += calls;
      }
    }
    // Sanity: the block really has lakes, so candidates were exercised.
    expect(lakeTiles).toBeGreaterThan(0);
    expect(callsAfterResolve).toBe(0);
  });
});
