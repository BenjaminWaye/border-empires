// v9 rivers run along tile edges (worldgen-rivers-edge.ts). v1-v8 river paths
// feed town placement in already-running seasons, so they must stay
// byte-identical -- the fingerprints below were taken from the pre-v9 code.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { setWorldSeed, terrainAt } from "./worldgen.js";
import { generateRiverPaths, riverEdgeKeysForCurrentSeed, riversForCurrentSeed } from "./worldgen-rivers.js";
import { riverEdgeKey, riverEdgeKeyBetween, tilesAlongRiverEdge } from "./worldgen-rivers-edge.js";

const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const isSea = (x: number, y: number): boolean => {
  const t = terrainAt(x, y);
  return t === "SEA" || t === "COASTAL_SEA";
};
const wrappedStep = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
};

describe("edge rivers (worldgenVersion 9)", () => {
  it("v8 river paths are byte-identical to the pre-v9 walker", () => {
    setWorldSeed(555, "continents", 8);
    expect(fingerprint(generateRiverPaths(555))).toBe("09bed212f7f0c6d5");
    setWorldSeed(4242, "islands", 8);
    expect(fingerprint(generateRiverPaths(4242))).toBe("cbd86ce06807da5a");
  });

  for (const [seed, style] of [[555, "continents"], [4242, "islands"]] as const) {
    it(`every step runs along one tile edge between two plain-land tiles and ends at the sea (${style})`, () => {
      setWorldSeed(seed, style, 9);
      const rivers = generateRiverPaths(seed);
      expect(rivers.length).toBeGreaterThan(0);
      for (const path of rivers) {
        for (let i = 0; i + 1 < path.length; i += 1) {
          const a = path[i]!;
          const b = path[i + 1]!;
          expect(Number.isInteger(a.wx) && Number.isInteger(a.wy)).toBe(true);
          expect(wrappedStep(a.wx, b.wx, WORLD_WIDTH) + wrappedStep(a.wy, b.wy, WORLD_HEIGHT)).toBe(1);
          for (const t of tilesAlongRiverEdge(a.wx, a.wy, b.wx, b.wy)) expect(terrainAt(t.x, t.y)).toBe("LAND");
        }
        const mouth = path[path.length - 1]!;
        const touchesSea = [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([dx, dy]) => isSea(mouth.wx + dx!, mouth.wy + dy!));
        expect(touchesSea).toBe(true);
      }
    });
  }

  it("meanders along the borders instead of running as dead-straight lines of edges", () => {
    // Regression: a purely-downhill walk followed BFS shortest paths, which in
    // a corridor to the sea is one straight line (one seed-3141 river ran 30
    // edges without a single turn). Narrow valleys can still force a long
    // straight stretch, so this checks the typical run, not the longest.
    setWorldSeed(555, "continents", 9);
    let edges = 0;
    let turns = 0;
    for (const path of generateRiverPaths(555)) {
      for (let i = 2; i < path.length; i += 1) {
        edges += 1;
        const prevHorizontal = path[i - 1]!.wy === path[i - 2]!.wy;
        const horizontal = path[i]!.wy === path[i - 1]!.wy;
        if (prevHorizontal !== horizontal) turns += 1;
      }
    }
    expect(edges / turns).toBeLessThan(3.5);
  });

  it("is deterministic and the memoized edge set matches the paths", () => {
    setWorldSeed(555, "continents", 9);
    const paths = riversForCurrentSeed();
    expect(generateRiverPaths(555)).toEqual(paths);
    const edges = riverEdgeKeysForCurrentSeed();
    const a = paths[0]![0]!;
    const b = paths[0]![1]!;
    expect(edges.has(riverEdgeKeyBetween(a.wx, a.wy, b.wx, b.wy))).toBe(true);
  });

  it("switching version on the same seed doesn't serve stale cached rivers", () => {
    setWorldSeed(555, "continents", 9);
    const v9 = riversForCurrentSeed();
    setWorldSeed(555, "continents", 8);
    expect(riversForCurrentSeed()).not.toEqual(v9);
    expect(riverEdgeKeysForCurrentSeed().size).toBe(0);
  });

  it("edge keys and edge tiles handle the toroidal wrap", () => {
    expect(riverEdgeKeyBetween(WORLD_WIDTH - 1, 5, 0, 5)).toBe(riverEdgeKey(WORLD_WIDTH - 1, 5, "H"));
    expect(riverEdgeKeyBetween(0, 5, WORLD_WIDTH - 1, 5)).toBe(riverEdgeKey(WORLD_WIDTH - 1, 5, "H"));
    expect(tilesAlongRiverEdge(3, 0, 4, 0)).toEqual([{ x: 3, y: WORLD_HEIGHT - 1 }, { x: 3, y: 0 }]);
    expect(tilesAlongRiverEdge(0, 7, 0, 8)).toEqual([{ x: WORLD_WIDTH - 1, y: 7 }, { x: 0, y: 7 }]);
  });
});
