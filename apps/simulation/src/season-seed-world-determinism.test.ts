import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT, terrainAt, setWorldSeed, overrideTerrainAt, wrapX, wrapY, type WorldStyle } from "@border-empires/shared";
import { createServerWorldgenIslandConnectivity } from "@border-empires/game-domain";

// Verifies the sequence in season-seed-world.ts where ensureLandMassesReachSea
// runs mid-loop (call A, feeding generateDocks that same iteration) and again
// after the final setWorldSeed() call once a candidate world is accepted
// (call B, before generateNaturalWonders). Both calls use the same worldSeed
// and setWorldSeed() resets the terrain cache before each, and nothing else
// calls overrideTerrainAt between them in the real pipeline — so this checks
// call A and call B produce byte-identical terrain, which is what makes the
// docks generated against call A's terrain still valid against call B's
// final terrain.
const snapshotTerrain = (): Uint8Array => {
  const snap = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const codeOf = { SEA: 0, LAND: 1, MOUNTAIN: 2, COASTAL_SEA: 3 } as const;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      snap[y * WORLD_WIDTH + x] = codeOf[terrainAt(x, y)];
    }
  }
  return snap;
};

describe("ensureLandMassesReachSea determinism across the mid-loop / post-loop calls", () => {
  it("produces byte-identical terrain for call A and call B given the same seed", () => {
    const connectivityRuntime = createServerWorldgenIslandConnectivity({
      WORLD_WIDTH,
      WORLD_HEIGHT,
      wrapX,
      wrapY,
      terrainAt,
      overrideTerrainAt
    });
    const seeds = [11, 22, 33, 44, 55];
    for (const style of ["continents", "islands"] as WorldStyle[]) {
      for (const seed of seeds) {
        setWorldSeed(seed, style);
        connectivityRuntime.ensureLandMassesReachSea();
        const snapshotA = snapshotTerrain();

        // Nothing between the two calls in the real pipeline touches terrain
        // via overrideTerrainAt except this function itself — reproduce that
        // exactly: reset via setWorldSeed with the same seed/style, then call
        // ensureLandMassesReachSea again, with no other terrain mutation.
        setWorldSeed(seed, style);
        connectivityRuntime.ensureLandMassesReachSea();
        const snapshotB = snapshotTerrain();

        expect(snapshotB).toEqual(snapshotA);
      }
    }
  });
});
