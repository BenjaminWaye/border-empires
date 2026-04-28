import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { chooseLegacySpawnPlacement } from "./spawn-placement.js";
import { simulationTileKey } from "./seed-state.js";

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
});
