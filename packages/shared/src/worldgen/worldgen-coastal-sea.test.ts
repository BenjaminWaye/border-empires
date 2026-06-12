import { describe, expect, it } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { setWorldSeed, terrainAt } from "./worldgen.js";

const neighbors = (x: number, y: number): Array<[number, number]> => {
  const xL = (x - 1 + WORLD_WIDTH) % WORLD_WIDTH;
  const xR = (x + 1) % WORLD_WIDTH;
  const yU = (y - 1 + WORLD_HEIGHT) % WORLD_HEIGHT;
  const yD = (y + 1) % WORLD_HEIGHT;
  return [
    [x, yU], [xR, yU], [xR, y], [xR, yD],
    [x, yD], [xL, yD], [xL, y], [xL, yU]
  ];
};

describe("shoreline tiles generate as land, not coastal sea", () => {
  it("never emits COASTAL_SEA from worldgen and keeps SEA fully off-coast", () => {
    setWorldSeed(42);

    let firstSea: [number, number] | undefined;
    let firstLand: [number, number] | undefined;

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const terrain = terrainAt(x, y);
        // The COASTAL_SEA terrain code is preserved on the type union for
        // back-compat with old snapshots, but worldgen must no longer emit
        // it — every tile with any land neighbour is generated as LAND so it
        // is capturable.
        expect(terrain).not.toBe("COASTAL_SEA");
        if (!firstLand && terrain === "LAND") firstLand = [x, y];
        if (!firstSea && terrain === "SEA") firstSea = [x, y];
      }
    }

    expect(firstLand).toBeDefined();
    expect(firstSea).toBeDefined();

    // Pure SEA tiles must be fully off-coast: no land in any 8-neighbour
    // (cardinal + diagonal). This locks in the rule that any sea tile
    // touching land — including only at a corner — flips to LAND, so
    // narrow channels and isthmuses become capturable shoreline.
    const [seaX, seaY] = firstSea!;
    expect(
      neighbors(seaX, seaY).every(([x, y]) => terrainAt(x, y) !== "LAND")
    ).toBe(true);
  });
});
