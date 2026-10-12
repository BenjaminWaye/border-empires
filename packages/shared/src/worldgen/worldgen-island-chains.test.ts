// Regression coverage for v10 archipelagos (worldgen-island-chain.ts): they
// used to be disks of up to 22 perfectly round islands, 6-20 tiles across,
// sometimes dropped in the middle of the ocean. Now they are chains of small,
// elongated islands in the offshore seas along a continent.
import { describe, expect, test } from "vitest";

import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { archipelagoBumpAt } from "./worldgen-archipelago-features.js";
import { setWorldSeed, terrainCodeAt, TERRAIN_LAND, TERRAIN_MOUNTAIN } from "./worldgen.js";

const FIX_VERSION = 10;
const CONTINENT_TILES = 400;

type IslandStat = { tiles: number; aspect: number; distToContinent: number };

const islandStats = (seed: number): IslandStat[] => {
  setWorldSeed(seed, "continents", FIX_VERSION);
  const isLand = (x: number, y: number): boolean => {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const t = terrainCodeAt((x + WORLD_WIDTH) % WORLD_WIDTH, y);
    return t === TERRAIN_LAND || t === TERRAIN_MOUNTAIN;
  };
  const comp = new Int32Array(WORLD_WIDTH * WORLD_HEIGHT).fill(-1);
  const comps: Array<Array<[number, number]>> = [];
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (!isLand(x, y) || comp[y * WORLD_WIDTH + x]! >= 0) continue;
      const id = comps.length;
      const pts: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[x, y]];
      comp[y * WORLD_WIDTH + x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        pts.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = (cx + dx + WORLD_WIDTH) % WORLD_WIDTH;
            const ny = cy + dy;
            if (ny < 0 || ny >= WORLD_HEIGHT || comp[ny * WORLD_WIDTH + nx]! >= 0 || !isLand(nx, ny)) continue;
            comp[ny * WORLD_WIDTH + nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      comps.push(pts);
    }
  }
  const isContinentTile = (x: number, y: number): boolean => {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const c = comp[y * WORLD_WIDTH + ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH]!;
    return c >= 0 && comps[c]!.length >= CONTINENT_TILES;
  };
  return comps
    .filter((p) => p.length < CONTINENT_TILES && p.some(([x, y]) => archipelagoBumpAt(x, y) > 0.3))
    .map((p) => {
      const x0 = p[0]![0];
      const pts = p.map(([x, y]) => [((x - x0 + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2, y] as const);
      const mx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
      const my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
      let sxx = 0;
      let sxy = 0;
      let syy = 0;
      for (const [px, py] of pts) {
        sxx += (px - mx) ** 2;
        sxy += (px - mx) * (py - my);
        syy += (py - my) ** 2;
      }
      const half = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
      const aspect = Math.sqrt(((sxx + syy) / 2 + half) / Math.max(1e-6, (sxx + syy) / 2 - half));
      let distToContinent = Infinity;
      for (const [x, y] of p) {
        for (let r = 1; r < Math.min(distToContinent, 61); r += 1) {
          let hit = false;
          for (let k = -r; k <= r && !hit; k += 1) {
            hit = isContinentTile(x + k, y - r) || isContinentTile(x + k, y + r) || isContinentTile(x - r, y + k) || isContinentTile(x + r, y + k);
          }
          if (hit) {
            distToContinent = r;
            break;
          }
        }
      }
      return { tiles: p.length, aspect, distToContinent };
    });
};

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe("island chains (v10)", () => {
  test("archipelago islands are small, elongated and lie off a continent, not round blobs in mid-ocean", () => {
    // Measured (40004 / 777777): 12 / 15 islands, median 32 / 31 tiles, max
    // 104 / 66, median aspect 1.60 / 1.53, max distance to a continent 31 / 34.
    const islands = [40004, 777777].flatMap(islandStats);
    expect(islands.length).toBeGreaterThanOrEqual(10);
    expect(median(islands.map((i) => i.tiles))).toBeLessThanOrEqual(50);
    expect(Math.max(...islands.map((i) => i.tiles))).toBeLessThanOrEqual(150);
    expect(median(islands.map((i) => i.aspect))).toBeGreaterThanOrEqual(1.4);
    for (const island of islands) expect(island.distToContinent).toBeLessThanOrEqual(45);
  }, 180_000);
});
