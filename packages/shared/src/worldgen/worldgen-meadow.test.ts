// Regression coverage for the forest-ringed meadow landmark (worldgenVersion
// 4): a clearing of LIGHT grass surrounded by a ring of DARK grass, scattered
// across grassland. Tests directly against meadowRingAt/grassShadeAt rather
// than reverse-engineering the pattern from raw noise, since ring width and
// radius are both randomized per formation.
import { describe, expect, test } from "vitest";
import { CURRENT_WORLDGEN_VERSION, grassShadeAt, landBiomeAt, setWorldSeed, terrainAt } from "../index.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";
import { meadowRingAt } from "./worldgen-meadow.js";

const scanLandTiles = (): { x: number; y: number }[] => {
  const tiles: { x: number; y: number }[] = [];
  for (let y = 60; y < WORLD_HEIGHT - 60; y += 2) {
    for (let x = 0; x < WORLD_WIDTH; x += 2) {
      if (terrainAt(x, y) === "LAND") tiles.push({ x, y });
    }
  }
  return tiles;
};

describe("worldgen forest-ringed meadow (v4)", () => {
  test("meadowRingAt finds both CLEARING and RING tiles on a fixed seed", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const tiles = scanLandTiles();
    const clearing = tiles.filter((t) => meadowRingAt(t.x, t.y, 9001) === "CLEARING");
    const ring = tiles.filter((t) => meadowRingAt(t.x, t.y, 9001) === "RING");
    expect(clearing.length).toBeGreaterThan(0);
    expect(ring.length).toBeGreaterThan(0);
  });

  test("a GRASS CLEARING tile always renders LIGHT and a GRASS RING tile always renders DARK under v4", () => {
    setWorldSeed(9001, "continents", CURRENT_WORLDGEN_VERSION);
    const tiles = scanLandTiles().filter((t) => landBiomeAt(t.x, t.y) === "GRASS");
    const clearingTiles = tiles.filter((t) => meadowRingAt(t.x, t.y, 9001) === "CLEARING");
    const ringTiles = tiles.filter((t) => meadowRingAt(t.x, t.y, 9001) === "RING");
    expect(clearingTiles.length).toBeGreaterThan(0);
    expect(ringTiles.length).toBeGreaterThan(0);
    expect(clearingTiles.every((t) => grassShadeAt(t.x, t.y) === "LIGHT")).toBe(true);
    expect(ringTiles.every((t) => grassShadeAt(t.x, t.y) === "DARK")).toBe(true);
  });

  test("meadow rings do not override shade under earlier worldgen versions", () => {
    setWorldSeed(9001, "continents", 3);
    const tiles = scanLandTiles().filter((t) => landBiomeAt(t.x, t.y) === "GRASS");
    const ringTiles = tiles.filter((t) => meadowRingAt(t.x, t.y, 9001) === "RING");
    // meadowRingAt itself isn't version-gated (it's a pure placement function),
    // but grassShadeFor must not consult it below v4 -- so a RING tile's shade
    // should just be whatever the ordinary mottle noise says, not forced DARK.
    expect(ringTiles.length).toBeGreaterThan(0);
    const allForcedDark = ringTiles.every((t) => grassShadeAt(t.x, t.y) === "DARK");
    expect(allForcedDark).toBe(false);
  });
});
