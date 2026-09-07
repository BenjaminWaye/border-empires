import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { chooseLegacySpawnPlacement } from "./spawn-placement.js";
import { SpawnPlacementIndex } from "./spawn-placement-index.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const buildLandGrid = (size: number): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  return tiles;
};

describe("SpawnPlacementIndex", () => {
  it("hasNearbySettled matches a Chebyshev distance < radius scan, kept in sync via refreshForTileChange", () => {
    const index = new SpawnPlacementIndex();
    const owned: DomainTileState = { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    index.refreshForTileChange(simulationTileKey(10, 10), owned);

    // Chebyshev distance from (10,10) to (10,15) is 5, which is < 6 but not < 5.
    expect(index.hasNearbySettled(10, 15, 6)).toBe(true);
    expect(index.hasNearbySettled(10, 15, 5)).toBe(false);
    // Far enough to land in a different grid cell entirely.
    expect(index.hasNearbySettled(500, 500, 10)).toBe(false);

    // Ownership lost (e.g. tile abandoned/captured to BARBARIAN) removes it.
    index.refreshForTileChange(simulationTileKey(10, 10), { ...owned, ownerId: undefined, ownershipState: undefined });
    expect(index.hasNearbySettled(10, 15, 6)).toBe(false);
  });

  it("hasNearbyTown matches a Manhattan distance <= radius scan, and unowned tiles with a town still count", () => {
    const index = new SpawnPlacementIndex();
    // Neutral/capturable town — no ownerId (see isNeutralBeaconTile) — must
    // still be indexed, since chooseLegacySpawnPlacement's original
    // townCoords derivation never filtered on ownership either.
    const neutralTown: DomainTileState = { x: 40, y: 40, terrain: "LAND", town: { name: "Ruins", type: "FARMING", populationTier: "SETTLEMENT" } };
    index.refreshForTileChange(simulationTileKey(40, 40), neutralTown);
    const tiles = new Map<string, DomainTileState>();
    for (let y = 39; y <= 41; y += 1) for (let x = 39; x <= 47; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    tiles.set(simulationTileKey(40, 40), neutralTown);

    // Manhattan distance from (40,40) to (45,40) is 5.
    expect(index.hasNearbyTown(tiles, 45, 40, 5)).toBe(true);
    expect(index.hasNearbyTown(tiles, 46, 40, 5)).toBe(false);

    index.refreshForTileChange(simulationTileKey(40, 40), { ...neutralTown, town: undefined });
    expect(index.hasNearbyTown(tiles, 45, 40, 5)).toBe(false);
  });

  it("hasNearbyFood is cached from the full tile map and matches a Manhattan distance <= radius scan", () => {
    const index = new SpawnPlacementIndex();
    const tiles = new Map<string, DomainTileState>();
    tiles.set(simulationTileKey(5, 5), { x: 5, y: 5, terrain: "LAND", resource: "FARM" });
    tiles.set(simulationTileKey(6, 6), { x: 6, y: 6, terrain: "LAND" });

    expect(index.hasNearbyFood(tiles, 5, 8, 3)).toBe(true);
    expect(index.hasNearbyFood(tiles, 5, 9, 3)).toBe(false);
  });

  it("coastalLandKeys is cached and equals a fresh computeCoastalLandKeys result", () => {
    const index = new SpawnPlacementIndex();
    const tiles = new Map<string, DomainTileState>();
    tiles.set(simulationTileKey(0, 0), { x: 0, y: 0, terrain: "LAND" });
    tiles.set(simulationTileKey(1, 0), { x: 1, y: 0, terrain: "SEA" });

    const keys = index.coastalLandKeys(tiles);
    expect(keys.has(simulationTileKey(0, 0))).toBe(true);
    // Calling again returns the same cached instance (not a fresh Set).
    expect(index.coastalLandKeys(tiles)).toBe(keys);
  });

  it("produces the same chooseLegacySpawnPlacement candidate as the unindexed fallback derivation", () => {
    const tiles = buildLandGrid(140);
    tiles.push({ x: 70, y: 70, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Alpha", type: "FARMING", populationTier: "SETTLEMENT" } });
    tiles.push({ x: 72, y: 70, terrain: "LAND", resource: "FARM" });

    const fallback = chooseLegacySpawnPlacement({ playerId: "newcomer", tiles });

    const index = new SpawnPlacementIndex();
    const tileMap = new Map<string, DomainTileState>();
    for (const tile of tiles) {
      const key = simulationTileKey(tile.x, tile.y);
      tileMap.set(key, tile);
      index.refreshForTileChange(key, tile);
    }

    const indexed = chooseLegacySpawnPlacement({
      playerId: "newcomer",
      tiles,
      coastalLandKeys: index.coastalLandKeys(tileMap),
      hasNearbySettled: (x, y, radius) => index.hasNearbySettled(x, y, radius),
      hasNearbyTown: (x, y, radius) => index.hasNearbyTown(tileMap, x, y, radius),
      hasNearbyFood: (x, y, radius) => index.hasNearbyFood(tileMap, x, y, radius)
    });

    expect(indexed).toEqual(fallback);
  });

  it("claimFairSpawnSite returns the nearest still-available precomputed site to a rally anchor", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 60; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    }
    const index = new SpawnPlacementIndex();
    const sites = index.fairSpawnSites(tiles);
    expect(sites.length).toBeGreaterThan(0);

    const isAvailable = (x: number, y: number): boolean => tiles.get(simulationTileKey(x, y))?.ownerId === undefined;
    const anchor = sites[Math.floor(sites.length / 2)]!;
    const claimed = index.claimFairSpawnSite(tiles, isAvailable, anchor);
    expect(claimed).toBeDefined();

    let expectedBest = sites[0]!;
    let expectedDistance = Math.max(Math.abs(expectedBest.x - anchor.x), Math.abs(expectedBest.y - anchor.y));
    for (const site of sites) {
      const distance = Math.max(Math.abs(site.x - anchor.x), Math.abs(site.y - anchor.y));
      if (distance < expectedDistance) {
        expectedDistance = distance;
        expectedBest = site;
      }
    }
    expect(claimed).toEqual(expectedBest);
  });

  it("claimFairSpawnSite (no rally anchor) picks the available site farthest from every settled player", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 60; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    }
    const index = new SpawnPlacementIndex();
    const sites = index.fairSpawnSites(tiles);
    expect(sites.length).toBeGreaterThan(1);

    // Settle a player right next to one candidate site so it becomes the
    // worst choice, and confirm claimFairSpawnSite avoids it.
    const nearbySite = sites[0]!;
    const settledTile: DomainTileState = { x: nearbySite.x + 1, y: nearbySite.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    index.refreshForTileChange(simulationTileKey(settledTile.x, settledTile.y), settledTile);

    const isAvailable = (x: number, y: number): boolean => tiles.get(simulationTileKey(x, y))?.ownerId === undefined;
    const claimed = index.claimFairSpawnSite(tiles, isAvailable);
    expect(claimed).toBeDefined();

    const chebyshev = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    let expectedBest = sites[0]!;
    let expectedDistance = chebyshev(expectedBest.x, expectedBest.y, settledTile.x, settledTile.y);
    for (const site of sites) {
      const distance = chebyshev(site.x, site.y, settledTile.x, settledTile.y);
      if (distance > expectedDistance) {
        expectedDistance = distance;
        expectedBest = site;
      }
    }
    expect(claimed).toEqual(expectedBest);
    expect(claimed).not.toEqual(nearbySite);
  });

  it("claimFairSpawnSite skips sites that are no longer available and returns undefined once every site is taken", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 60; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    }
    const index = new SpawnPlacementIndex();
    const sites = index.fairSpawnSites(tiles);
    expect(sites.length).toBeGreaterThan(0);

    const takenKeys = new Set(sites.map((site) => simulationTileKey(site.x, site.y)));
    const isAvailable = (): boolean => false;
    expect(index.claimFairSpawnSite(tiles, isAvailable)).toBeUndefined();
    expect(takenKeys.size).toBe(sites.length);
  });
});
