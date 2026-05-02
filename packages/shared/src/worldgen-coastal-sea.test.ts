import { describe, expect, it } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";
import { setWorldSeed, terrainAt } from "./worldgen.js";

const neighbors = (x: number, y: number): Array<[number, number]> => [
  [x, (y - 1 + WORLD_HEIGHT) % WORLD_HEIGHT],
  [(x + 1) % WORLD_WIDTH, y],
  [x, (y + 1) % WORLD_HEIGHT],
  [(x - 1 + WORLD_WIDTH) % WORLD_WIDTH, y]
];

describe("coastal sea terrain", () => {
  it("classifies shoreline water separately from deep sea", () => {
    setWorldSeed(42);

    let coastal: [number, number] | undefined;
    let deep: [number, number] | undefined;

    for (let y = 0; y < WORLD_HEIGHT && (!coastal || !deep); y += 1) {
      for (let x = 0; x < WORLD_WIDTH && (!coastal || !deep); x += 1) {
        const terrain = terrainAt(x, y);
        if (terrain === "COASTAL_SEA") coastal = [x, y];
        if (terrain === "SEA") deep = [x, y];
      }
    }

    expect(coastal).toBeDefined();
    expect(deep).toBeDefined();

    const [coastalX, coastalY] = coastal!;
    const [deepX, deepY] = deep!;

    expect(neighbors(coastalX, coastalY).some(([x, y]) => terrainAt(x, y) === "LAND")).toBe(true);
    expect(neighbors(deepX, deepY).every(([x, y]) => terrainAt(x, y) !== "LAND")).toBe(true);
  });
});
