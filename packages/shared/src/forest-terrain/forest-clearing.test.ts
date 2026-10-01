import { afterEach, describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { forestClearingEpoch, isForestClearedAt, resetForestClearings, setWorldSeed } from "../worldgen/worldgen.js";
import { clearForestAroundAfcTile, clearForestAroundAfcTiles } from "./forest-clearing.js";
import { isForestTileAt } from "./forest-terrain.js";

const findForestTile = (): { x: number; y: number } => {
  for (let y = 20; y < WORLD_HEIGHT - 20; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) if (isForestTileAt(x, y)) return { x, y };
  }
  throw new Error("no forest tile in this world");
};

describe("AFC forest clearing", () => {
  afterEach(() => resetForestClearings());

  it("clears forest from the AFC tile's whole 3x3 footprint and bumps the clearing epoch", () => {
    setWorldSeed(77, "continents", 1);
    const forest = findForestTile();
    const epochBefore = forestClearingEpoch();
    // Land the AFC diagonally off the forest tile: it must still be cleared.
    expect(clearForestAroundAfcTile(forest.x + 1, forest.y + 1)).toBe(true);
    expect(isForestTileAt(forest.x, forest.y)).toBe(false);
    expect(isForestClearedAt(forest.x, forest.y)).toBe(true);
    expect(forestClearingEpoch()).toBeGreaterThan(epochBefore);
    // Idempotent: a second pass changes nothing and leaves the epoch alone.
    const epochAfter = forestClearingEpoch();
    expect(clearForestAroundAfcTile(forest.x + 1, forest.y + 1)).toBe(false);
    expect(forestClearingEpoch()).toBe(epochAfter);
  });

  it("only derives clearings from tiles that actually carry an AFC", () => {
    setWorldSeed(77, "continents", 1);
    const forest = findForestTile();
    clearForestAroundAfcTiles([{ x: forest.x, y: forest.y }]);
    expect(isForestTileAt(forest.x, forest.y)).toBe(true);
    clearForestAroundAfcTiles([{ x: forest.x, y: forest.y, afc: { ownerId: "p1" } }]);
    expect(isForestTileAt(forest.x, forest.y)).toBe(false);
  });

  it("drops clearings on a world reset so the forest is procedural again", () => {
    setWorldSeed(77, "continents", 1);
    const forest = findForestTile();
    clearForestAroundAfcTile(forest.x, forest.y);
    expect(isForestTileAt(forest.x, forest.y)).toBe(false);
    setWorldSeed(77, "continents", 1);
    expect(isForestTileAt(forest.x, forest.y)).toBe(true);
  });
});
