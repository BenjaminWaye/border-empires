import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, type TileKey } from "@border-empires/shared";
import { key, parseKey } from "@border-empires/game-domain";

import {
  BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN,
  BARBARIAN_SEED_TARGET,
  BARBARIAN_START_SITE_PATROL_DISTANCE,
  seedBarbarianTiles,
  type BarbarianSeedInput
} from "./season-barbarian-seed.js";

const wrappedChebyshev = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

// Cheap deterministic hash in [0, 1).
const seeded01 = (a: number, b: number, seed: number): number => {
  const n = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

const baseInput = (overrides: Partial<BarbarianSeedInput> = {}): BarbarianSeedInput => ({
  spawnPositions: [],
  ownership: new Map<TileKey, string>(),
  townsByTile: new Map(),
  docksByTile: new Map(),
  worldSeed: 4242,
  terrainAt: () => "LAND",
  seeded01,
  ...overrides
});

const startSites = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 300, y: 200 },
  // Near the world edge, so its ring wraps.
  { x: 5, y: 310 }
];

const patrolsNear = (tiles: Set<TileKey>, site: { x: number; y: number }): Array<[number, number]> =>
  [...tiles].map((tk) => parseKey(tk)).filter(([x, y]) => wrappedChebyshev(x, y, site.x, site.y) === BARBARIAN_START_SITE_PATROL_DISTANCE);

describe("seedBarbarianTiles start-site patrols", () => {
  it("posts one Planetary Defense tile 20 tiles out from every start site, on top of the random scatter", () => {
    const input = baseInput({ startSites });
    const tiles = seedBarbarianTiles(input);

    for (const site of startSites) {
      expect(patrolsNear(tiles, site)).toHaveLength(1);
    }
    expect(tiles.size).toBe(BARBARIAN_SEED_TARGET + startSites.length);
    for (const tk of tiles) expect(input.ownership.get(tk)).toBe("barbarian-1");
  });

  it("is deterministic for the same world seed", () => {
    const first = [...seedBarbarianTiles(baseInput({ startSites }))];
    const second = [...seedBarbarianTiles(baseInput({ startSites }))];
    expect(second).toEqual(first);
  });

  it("falls back to a nearby ring when the 20-tile ring is all sea", () => {
    const site = { x: 100, y: 100 };
    const terrainAt = (x: number, y: number): string =>
      wrappedChebyshev(x, y, site.x, site.y) === BARBARIAN_START_SITE_PATROL_DISTANCE ? "SEA" : "LAND";
    const tiles = seedBarbarianTiles(baseInput({ startSites: [site], terrainAt }));
    const near = [...tiles].map((tk) => parseKey(tk)).filter(([x, y]) => {
      const distance = wrappedChebyshev(x, y, site.x, site.y);
      return distance >= BARBARIAN_START_SITE_PATROL_DISTANCE - 3 && distance <= BARBARIAN_START_SITE_PATROL_DISTANCE + 3;
    });
    expect(near.length).toBeGreaterThanOrEqual(1);
    expect(near.some(([x, y]) => wrappedChebyshev(x, y, site.x, site.y) === BARBARIAN_START_SITE_PATROL_DISTANCE + 1)).toBe(true);
  });

  it("never posts a patrol on a town, a dock, owned land, or close to another start site", () => {
    const site = { x: 100, y: 100 };
    // Another start site 25 tiles east: its keep-out covers part of the first site's ring.
    const neighbour = { x: 125, y: 100 };
    const blocked = new Map<TileKey, unknown>();
    for (let d = -20; d <= 20; d += 1) blocked.set(key(site.x + d, site.y - 20), {});
    const tiles = seedBarbarianTiles(baseInput({ startSites: [site, neighbour], townsByTile: blocked }));
    const patrol = patrolsNear(tiles, site);
    expect(patrol).toHaveLength(1);
    const [px, py] = patrol[0]!;
    expect(blocked.has(key(px, py))).toBe(false);
    expect(wrappedChebyshev(px, py, neighbour.x, neighbour.y)).toBeGreaterThanOrEqual(BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN);
  });

  it("adds no patrols when no start sites are given", () => {
    expect(seedBarbarianTiles(baseInput()).size).toBe(BARBARIAN_SEED_TARGET);
  });
});
