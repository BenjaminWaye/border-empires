// Pins whole-map terrain + hills for fixed seeds. Seasons keep the worldgen
// version they were created with, so a change that alters an older version's
// output silently reshapes maps that are already being played. The v1 and v9
// hashes were taken from origin/develop before v10 landed; the v10 hash is the
// "Map A" seed shown in the map feedback form.
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsRegionAt } from "./worldgen-hills.js";
import { setWorldSeed, terrainCodeAt } from "./worldgen.js";

const terrainHash = (seed: number, version: number): string => {
  setWorldSeed(seed, "continents", version);
  const hash = createHash("sha256");
  const row = new Uint8Array(WORLD_WIDTH);
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) row[x] = terrainCodeAt(x, y) * 4 + (isHillsRegionAt(x, y) ? 1 : 0);
    hash.update(row);
  }
  return hash.digest("hex").slice(0, 16);
};

describe.skipIf(WORLD_WIDTH !== 640 || WORLD_HEIGHT !== 320)("worldgen terrain pins (640x320)", () => {
  test.each([
    { seed: 2024, version: 1, expected: "0e3c200b7f9c2f24" },
    { seed: 2024, version: 9, expected: "0570666c087e61da" },
    { seed: 200185, version: 10, expected: "0819519f876c07c3" }
  ])("seed $seed at worldgen v$version keeps its map", ({ seed, version, expected }) => {
    expect(terrainHash(seed, version)).toBe(expected);
  }, 180_000);
});
