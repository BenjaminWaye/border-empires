import { describe, expect, it } from "vitest";
import { setWorldSeed } from "@border-empires/shared";
import { isForestTile, isHillsTile, isLightGrassScatterTile } from "./client-constants.js";

// isLightGrassScatterTile is purely cosmetic (decorative leaf saplings on
// light-shaded grass, see its doc comment) and must never overlap with the
// two gameplay-affecting predicates it's built next to.
describe("isLightGrassScatterTile", () => {
  it("never overlaps with isForestTile or isHillsTile for the same tile", () => {
    setWorldSeed(2024);
    let sampled = 0;
    for (let x = 0; x < 200; x += 1) {
      for (let y = 20; y < 220; y += 1) {
        sampled += 1;
        if (isLightGrassScatterTile(x, y)) {
          expect(isForestTile(x, y)).toBe(false);
          expect(isHillsTile(x, y)).toBe(false);
        }
      }
    }
    expect(sampled).toBeGreaterThan(0);
  });

  it("is reachable at all (at least one scatter tile in a reasonably sized sample)", () => {
    setWorldSeed(2024);
    let found = false;
    for (let x = 0; x < 200 && !found; x += 1) {
      for (let y = 20; y < 220 && !found; y += 1) {
        if (isLightGrassScatterTile(x, y)) found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("is deterministic for a given world tile", () => {
    setWorldSeed(2024);
    expect(isLightGrassScatterTile(17, 42)).toBe(isLightGrassScatterTile(17, 42));
  });
});
