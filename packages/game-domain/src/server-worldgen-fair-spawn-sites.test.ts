import { describe, expect, it } from "vitest";
import type { DomainTileState } from "./index/index.js";
import { computeFairSpawnSites } from "./server-worldgen-fair-spawn-sites.js";

describe("computeFairSpawnSites", () => {
  const buildLandGrid = (size: number): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    return tiles;
  };

  it("returns an empty roster for an empty world", () => {
    expect(computeFairSpawnSites([], 50)).toEqual([]);
  });

  it("uses up every tier-1 (town+food) site before pulling in any lower-tier site", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    const townTile = tiles.find((tile) => tile.x === 3 && tile.y === 3)!;
    townTile.town = { type: "MARKET", populationTier: "SETTLEMENT" };
    const foodTile = tiles.find((tile) => tile.x === 5 && tile.y === 3)!;
    foodTile.resource = "FARM";
    // Tiles closer than MIN_TOWN_SPAWN_DISTANCE (5) to the town are excluded
    // entirely, not just demoted to a lower tier -- matches the same
    // too-close-to-town floor apps/simulation's per-player search enforces.
    const manhattanFromTown = (x: number, y: number): number => Math.abs(x - 3) + Math.abs(y - 3);
    const tier1Tiles = tiles.filter((tile) => tile !== townTile && manhattanFromTown(tile.x, tile.y) >= 5);
    const tier1CandidateCount = tier1Tiles.length;

    for (let y = 0; y < 7; y += 1) {
      for (let x = 7; x < 9; x += 1) tiles.push({ x, y, terrain: "SEA" });
    }
    for (let y = 0; y < 7; y += 1) {
      for (let x = 9; x < 41; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }

    const targetCount = tier1CandidateCount + 12;
    const sites = computeFairSpawnSites(tiles, targetCount);

    expect(sites.length).toBe(targetCount);
    const chosenKeys = new Set(sites.map((site) => `${site.x},${site.y}`));
    for (const tile of tier1Tiles) {
      expect(chosenKeys.has(`${tile.x},${tile.y}`)).toBe(true);
    }
    expect(sites.filter((site) => site.x >= 9).length).toBe(12);
  });

  it("never includes a site closer than 5 tiles to a town, even when the town also offers food", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 21; y += 1) {
      for (let x = 0; x < 21; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    const townTile = tiles.find((tile) => tile.x === 10 && tile.y === 10)!;
    townTile.town = { type: "MARKET", populationTier: "SETTLEMENT" };
    const foodTile = tiles.find((tile) => tile.x === 12 && tile.y === 10)!;
    foodTile.resource = "FARM";

    const sites = computeFairSpawnSites(tiles, 50);

    for (const site of sites) {
      const distanceToTown = Math.abs(site.x - 10) + Math.abs(site.y - 10);
      expect(distanceToTown).toBeGreaterThanOrEqual(5);
    }
  });

  it("spreads sites out rather than clustering them, and stays deterministic", () => {
    const tiles = buildLandGrid(140);
    const first = computeFairSpawnSites(tiles, 50);
    const second = computeFairSpawnSites(tiles, 50);
    expect(first.length).toBe(50);
    expect(second).toEqual(first);

    const chebyshev = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
    for (let i = 0; i < first.length; i += 1) {
      let minDistance = Infinity;
      for (let j = 0; j < first.length; j += 1) {
        if (i === j) continue;
        minDistance = Math.min(minDistance, chebyshev(first[i]!.x, first[i]!.y, first[j]!.x, first[j]!.y));
      }
      expect(minDistance).toBeGreaterThan(1);
    }
  });
});
