// Its own file so worldgen's module state starts fresh: no setWorldSeed call
// has happened yet, exactly like the client before INIT arrives.
import { afterEach, describe, expect, test } from "vitest";

import { isHillsRegionAt } from "./worldgen-hills.js";
import { setWorldSeed, terrainCodeAt } from "./worldgen.js";
import { setWorldTerrainStore, type WorldTerrainLayer } from "./worldgen-terrain-persistence.js";

afterEach(() => setWorldTerrainStore(undefined));

describe("device terrain store before the world is set", () => {
  test("the default placeholder world is never loaded or saved, so it cannot evict the real one", () => {
    const calls: string[] = [];
    setWorldTerrainStore({
      load: (layer: WorldTerrainLayer) => {
        calls.push(`load:${layer}`);
        return undefined;
      },
      save: (layer: WorldTerrainLayer) => {
        calls.push(`save:${layer}`);
      }
    });

    terrainCodeAt(320, 160); // the 2D draw loop's pre-INIT terrainAt fallback
    isHillsRegionAt(320, 160);
    expect(calls).toEqual([]);

    setWorldSeed(377720878, "continents", 12);
    terrainCodeAt(320, 160);
    expect(calls).toEqual(["load:terrain", "save:terrain"]);
  }, 60_000);
});
