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
  startSites: [],
  landmassAt: () => 0,
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
  it("posts one Planetary Defense tile 20 tiles out from every start site, topped up to the seed budget at random", () => {
    const input = baseInput({ startSites });
    const tiles = seedBarbarianTiles(input);

    for (const site of startSites) {
      expect(patrolsNear(tiles, site)).toHaveLength(1);
    }
    expect(tiles.size).toBe(BARBARIAN_SEED_TARGET);
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

  it("spends the whole budget on patrols when the roster is larger than it, seeding no random tiles", () => {
    // A 10x5 grid of sites 60 apart, like a full 50-site worldgen roster.
    const fullRoster = Array.from({ length: 50 }, (_, index) => ({ x: 30 + (index % 10) * 60, y: 30 + Math.floor(index / 10) * 60 }));
    const tiles = seedBarbarianTiles(baseInput({ startSites: fullRoster }));
    expect(tiles.size).toBe(fullRoster.length);
    for (const site of fullRoster) expect(patrolsNear(tiles, site)).toHaveLength(1);
  });

  it("keeps random tiles clear of every start site", () => {
    const tiles = seedBarbarianTiles(baseInput({ startSites }));
    for (const tk of tiles) {
      const [x, y] = parseKey(tk);
      for (const site of startSites) expect(wrappedChebyshev(x, y, site.x, site.y)).toBeGreaterThanOrEqual(BARBARIAN_SEED_MIN_DISTANCE_FROM_SPAWN);
    }
  });

  it("within a ring, prefers a tile on the site's own landmass over other land", () => {
    const site = { x: 100, y: 100 };
    // Only the site and one tile of its 20-tile ring, (80, 100), are on the
    // site's landmass; the other 159 ring tiles are another landmass.
    const ownLandmass = (x: number, y: number): boolean => (x === 80 && y === 100) || (x === site.x && y === site.y);
    const tiles = seedBarbarianTiles(baseInput({ startSites: [site], landmassAt: (x, y) => (ownLandmass(x, y) ? 0 : 1) }));
    expect(patrolsNear(tiles, site)).toEqual([[80, 100]]);
  });

  it("gives a site on a small island a patrol on the nearest other land, out to 60 tiles", () => {
    const site = { x: 100, y: 100 };
    // The site's island is 7x7; the nearest other land starts 45 tiles east.
    const terrainAt = (x: number, y: number): string =>
      wrappedChebyshev(x, y, site.x, site.y) <= 3 || (x >= 145 && x <= 150 && Math.abs(y - site.y) <= 20) ? "LAND" : "SEA";
    const tiles = seedBarbarianTiles(baseInput({ startSites: [site], terrainAt, landmassAt: (x) => (x >= 145 ? 1 : 0) }));
    const distances = [...tiles].map((tk) => { const [x, y] = parseKey(tk); return wrappedChebyshev(x, y, site.x, site.y); });
    expect(Math.min(...distances)).toBe(45);
  });

  it("in a crowded cluster, falls back to 10-11 tiles from the sites rather than no patrol", () => {
    // Three sites 14 apart on a strip of land only 2 tiles wide and 50 long:
    // every land tile is within 12 of some site, but not all within 10.
    const sites = [{ x: 100, y: 100 }, { x: 114, y: 100 }, { x: 128, y: 100 }];
    const terrainAt = (x: number, y: number): string => (x >= 90 && x <= 139 && (y === 100 || y === 101) ? "LAND" : "SEA");
    const tiles = seedBarbarianTiles(baseInput({ startSites: sites, terrainAt }));
    expect(tiles.size).toBeGreaterThanOrEqual(1);
    for (const tk of tiles) {
      const [x, y] = parseKey(tk);
      for (const site of sites) expect(wrappedChebyshev(x, y, site.x, site.y)).toBeGreaterThanOrEqual(10);
    }
  });

  it("adds no patrols when no start sites are given", () => {
    expect(seedBarbarianTiles(baseInput()).size).toBe(BARBARIAN_SEED_TARGET);
  });
});
