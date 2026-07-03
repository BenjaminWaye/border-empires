import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { chooseLegacySpawnPlacement } from "./spawn-placement.js";
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
});
