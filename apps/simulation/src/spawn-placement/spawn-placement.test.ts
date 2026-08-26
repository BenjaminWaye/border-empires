import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { chooseLegacySpawnPlacement, computeFairSpawnSites, computeLandRegions } from "./spawn-placement.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

describe("chooseLegacySpawnPlacement", () => {
  it("chooses a tile near food and town while respecting spawn distance", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({
      x: 20,
      y: 20,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Alpha" }
    });
    tiles.push({ x: 100, y: 100, terrain: "LAND", town: { type: "MARKET", populationTier: "SETTLEMENT", name: "Beta" } });
    tiles.push({ x: 102, y: 100, terrain: "LAND", resource: "FARM" });
    tiles.push({ x: 80, y: 80, terrain: "LAND", town: { type: "MARKET", populationTier: "SETTLEMENT", name: "Far" } });
    tiles.push({ x: 82, y: 80, terrain: "LAND", resource: "FARM" });

    const spawn = chooseLegacySpawnPlacement({
      playerId: "firebase-user-1",
      tiles
    });

    expect(spawn).toBeDefined();
    expect(spawn!.x).toBeGreaterThanOrEqual(90);
    expect(spawn!.x).toBeLessThanOrEqual(110);
    expect(spawn!.y).toBeGreaterThanOrEqual(90);
    expect(spawn!.y).toBeLessThanOrEqual(110);
  });

  it("never spawns on a land component fully sealed by mountains with no sea adjacency", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 30; y += 1) {
      for (let x = 0; x < 30; x += 1) {
        tiles.push({ x, y, terrain: "SEA" });
      }
    }
    const setTerrain = (x: number, y: number, terrain: DomainTileState["terrain"]): void => {
      const tile = tiles.find((entry) => entry.x === x && entry.y === y);
      if (tile) tile.terrain = terrain;
    };
    for (let y = 4; y <= 8; y += 1) {
      for (let x = 4; x <= 8; x += 1) setTerrain(x, y, "LAND");
    }
    const sealedLand: Array<[number, number]> = [
      [20, 20], [21, 20], [22, 20],
      [20, 21], [21, 21], [22, 21],
      [20, 22], [21, 22], [22, 22]
    ];
    for (const [x, y] of sealedLand) setTerrain(x, y, "LAND");
    for (let y = 19; y <= 23; y += 1) {
      for (let x = 19; x <= 23; x += 1) {
        if (sealedLand.some(([sx, sy]) => sx === x && sy === y)) continue;
        setTerrain(x, y, "MOUNTAIN");
      }
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const spawn = chooseLegacySpawnPlacement({
        playerId: `firebase-user-sealed-${attempt}`,
        tiles
      });
      expect(spawn).toBeDefined();
      const onSealed = sealedLand.some(([x, y]) => x === spawn!.x && y === spawn!.y);
      expect(onSealed).toBe(false);
    }
  });


  it("falls back to first available land when strict placement constraints cannot be met", () => {
    const tiles: DomainTileState[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 0, y: 1, terrain: "SEA" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
      { x: 1, y: 1, terrain: "LAND" }
    ];

    const spawn = chooseLegacySpawnPlacement({
      playerId: "firebase-user-2",
      tiles,
      blockedTileKeys: new Set([simulationTileKey(0, 0), simulationTileKey(1, 0)])
    });

    expect(spawn).toEqual({ x: 1, y: 1 });
  });

  it("treats FRONTIER tiles as occupied so new spawns stay clear of expanding territory", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    const setOwned = (x: number, y: number, state: "SETTLED" | "FRONTIER"): void => {
      const tile = tiles.find((entry) => entry.x === x && entry.y === y);
      if (tile) {
        tile.ownerId = "player-1";
        tile.ownershipState = state;
      }
    };
    setOwned(70, 70, "SETTLED");
    for (let x = 71; x <= 90; x += 1) setOwned(x, 70, "FRONTIER");

    const spawn = chooseLegacySpawnPlacement({ playerId: "newcomer", tiles });

    expect(spawn).toBeDefined();
    expect(chebyshevDistance(spawn!.x, spawn!.y, 90, 70)).toBeGreaterThanOrEqual(50);
  });

  it("maximizes distance from existing players when the map is too crowded for the minimum spacing", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    const setOwned = (x: number, y: number): void => {
      const tile = tiles.find((entry) => entry.x === x && entry.y === y);
      if (tile) {
        tile.ownerId = "player-1";
        tile.ownershipState = "SETTLED";
      }
    };
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 25; x += 1) setOwned(x, y);
    }

    const spawn = chooseLegacySpawnPlacement({ playerId: "newcomer", tiles });

    expect(spawn).toBeDefined();
    expect(spawn!.x).toBeGreaterThanOrEqual(34);
  });

  it("computeLandRegions assigns different region ids to landmasses split by sea, and the same id within one landmass", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) tiles.push({ x, y, terrain: "LAND" });
      for (let x = 5; x < 7; x += 1) tiles.push({ x, y, terrain: "SEA" });
      for (let x = 7; x < 12; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }

    const regions = computeLandRegions(tiles);
    expect(regions.get(simulationTileKey(0, 0))).toBe(regions.get(simulationTileKey(4, 4)));
    expect(regions.get(simulationTileKey(0, 0))).not.toBe(regions.get(simulationTileKey(7, 0)));
  });

  it("never spawns next to a resource that is only reachable by crossing water, even when it is the closest one by straight-line distance", () => {
    // Land A (0-19,0-19) has no food or town anywhere on it. Land B (22-24,0-19),
    // separated from Land A by a 2-tile-wide sea strait, has the only FARM in
    // the world at (22,10) — well within Manhattan radius 10 of Land A's coast
    // (e.g. (19,10) is only 3 tiles away as the crow flies), but unreachable by
    // land. A correct implementation must never accept a Land A spawn on the
    // strength of that food, since hasNearbyFood requires land connectivity.
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) tiles.push({ x, y, terrain: "LAND" });
      for (let x = 20; x < 22; x += 1) tiles.push({ x, y, terrain: "SEA" });
      for (let x = 22; x < 25; x += 1) tiles.push({ x, y, terrain: "LAND", ...(x === 22 && y === 10 ? { resource: "FARM" as const } : {}) });
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const spawn = chooseLegacySpawnPlacement({ playerId: `firebase-user-water-${attempt}`, tiles });
      expect(spawn).toBeDefined();
      expect(spawn!.x).toBeGreaterThanOrEqual(22);
    }
  });

  it("prefers open land near a rally anchor before default spawn placement", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 70, y: 70, terrain: "LAND", ownerId: "owner", ownershipState: "SETTLED" });

    const spawn = chooseLegacySpawnPlacement({
      playerId: "friend",
      tiles,
      rallyAnchor: { x: 70, y: 70 }
    });

    expect(spawn).toBeDefined();
    expect(Math.max(Math.abs(spawn!.x - 70), Math.abs(spawn!.y - 70))).toBeLessThanOrEqual(24);
  });

  it("prefers a rally spawn near town and food over a barren tile that is merely closer to the anchor", () => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    // Anchor player's settled tile.
    tiles.push({ x: 70, y: 70, terrain: "LAND", ownerId: "owner", ownershipState: "SETTLED" });
    // A town + food cluster well within rally radius but not the closest tiles to the anchor.
    tiles.push({ x: 80, y: 70, terrain: "LAND", town: { type: "MARKET", populationTier: "SETTLEMENT", name: "Nearby" } });
    tiles.push({ x: 82, y: 70, terrain: "LAND", resource: "FARM" });

    const spawn = chooseLegacySpawnPlacement({
      playerId: "friend",
      tiles,
      rallyAnchor: { x: 70, y: 70 }
    });

    expect(spawn).toBeDefined();
    // Should land near the town/food cluster (within radius 10 of it), not just
    // be the nearest bare tile to the anchor at (71,70) or similar.
    expect(chebyshevDistance(spawn!.x, spawn!.y, 80, 70)).toBeLessThanOrEqual(10);
  });
});

describe("computeFairSpawnSites", () => {
  const buildLandGridWithAmenities = (size: number): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) tiles.push({ x, y, terrain: "LAND" });
    }
    // Scatter towns/food densely enough that plenty of tiles qualify for the
    // top amenity tier (town + food both within radius 10).
    for (let y = 5; y < size; y += 10) {
      for (let x = 5; x < size; x += 10) {
        const town = tiles.find((tile) => tile.x === x && tile.y === y);
        if (town) town.town = { type: "MARKET", populationTier: "SETTLEMENT", name: `Town ${x},${y}` };
        const food = tiles.find((tile) => tile.x === x + 2 && tile.y === y);
        if (food) food.resource = "FARM";
      }
    }
    return tiles;
  };

  it("returns up to the requested count of sites, all distinct and on open land", () => {
    const tiles = buildLandGridWithAmenities(140);
    const sites = computeFairSpawnSites(tiles, 50);

    expect(sites.length).toBe(50);
    const seen = new Set<string>();
    for (const site of sites) {
      const key = simulationTileKey(site.x, site.y);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const tile = tiles.find((entry) => entry.x === site.x && entry.y === site.y);
      expect(tile?.terrain).toBe("LAND");
      expect(tile?.ownerId).toBeUndefined();
      expect(tile?.town).toBeUndefined();
    }
  });

  it("spreads sites out rather than clustering them in one region", () => {
    const tiles = buildLandGridWithAmenities(140);
    const sites = computeFairSpawnSites(tiles, 50);

    // Every site should have some minimum separation from every other site —
    // farthest-point sampling should never leave two sites stacked adjacent
    // to each other when far larger open land is available.
    for (let i = 0; i < sites.length; i += 1) {
      let minDistance = Infinity;
      for (let j = 0; j < sites.length; j += 1) {
        if (i === j) continue;
        const distance = chebyshevDistance(sites[i]!.x, sites[i]!.y, sites[j]!.x, sites[j]!.y);
        if (distance < minDistance) minDistance = distance;
      }
      expect(minDistance).toBeGreaterThan(1);
    }
  });

  it("is deterministic given the same tile list", () => {
    const tiles = buildLandGridWithAmenities(140);
    const first = computeFairSpawnSites(tiles, 50);
    const second = computeFairSpawnSites(tiles, 50);
    expect(second).toEqual(first);
  });

  it("returns fewer sites than requested rather than falling back to unsuitable tiles when land is scarce", () => {
    const tiles: DomainTileState[] = [
      { x: 0, y: 0, terrain: "LAND" },
      { x: 1, y: 0, terrain: "LAND" },
      { x: 0, y: 1, terrain: "SEA" }
    ];
    const sites = computeFairSpawnSites(tiles, 50);
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.length).toBeLessThan(50);
  });

  it("returns an empty roster for an empty world", () => {
    expect(computeFairSpawnSites([], 50)).toEqual([]);
  });
});
