import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { chooseReplacementAfcSite } from "./afc-owned-site.js";

const tileMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((tile) => [simulationTileKey(tile.x, tile.y), tile]));
const town = { type: "MARKET", populationTier: "TOWN" } as const;

describe("chooseReplacementAfcSite", () => {
  it("prefers an owned empty tile over neutral land", () => {
    const tiles = tileMap([
      { x: 5, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town },
      { x: 9, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 6, y: 5, terrain: "LAND" }
    ]);
    expect(chooseReplacementAfcSite({ playerId: "p1", tiles, isBlocked: () => false })).toEqual({ tile: expect.objectContaining({ x: 9, y: 5 }), placement: "owned_tile" });
  });

  it("skips locked or pending owned tiles", () => {
    const tiles = tileMap([
      { x: 5, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 6, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }
    ]);
    const site = chooseReplacementAfcSite({ playerId: "p1", tiles, isBlocked: (key) => key === simulationTileKey(5, 5) });
    expect(site?.tile).toEqual(expect.objectContaining({ x: 6, y: 5 }));
  });

  it("returns undefined when no owned or adjacent neutral land tile is valid", () => {
    const tiles: DomainTileState[] = [{ x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town }];
    for (let x = 0; x <= 2; x += 1) for (let y = 0; y <= 2; y += 1) if (x !== 1 || y !== 1) tiles.push({ x, y, terrain: "SEA" });
    tiles.push({ x: 3, y: 1, terrain: "LAND" }); // neutral but not adjacent
    expect(chooseReplacementAfcSite({ playerId: "p1", tiles: tileMap(tiles), isBlocked: () => false })).toBeUndefined();
  });

  it("returns undefined for a player with no territory", () => {
    expect(chooseReplacementAfcSite({ playerId: "p1", tiles: tileMap([{ x: 0, y: 0, terrain: "LAND" }]), isBlocked: () => false })).toBeUndefined();
  });
});
