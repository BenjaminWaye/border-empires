import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { isCoastalLand } from "./runtime-ability-helpers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const land = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND" } as DomainTileState);
const sea = (x: number, y: number): DomainTileState => ({ x, y, terrain: "SEA" } as DomainTileState);

const tilesMap = (tiles: DomainTileState[]): Map<string, DomainTileState> => {
  const map = new Map<string, DomainTileState>();
  for (const tile of tiles) map.set(simulationTileKey(tile.x, tile.y), tile);
  return map;
};

describe("isCoastalLand", () => {
  it("treats a land tile with only a diagonal sea neighbor as coastal", () => {
    // Worldgen flips every sea tile orthogonally adjacent to land into LAND,
    // so real coastal tiles only ever border open sea diagonally.
    const tiles = tilesMap([land(5, 5), land(5, 6), land(6, 5), sea(6, 6)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(true);
  });

  it("does not treat a land tile fully surrounded by land as coastal", () => {
    const tiles = tilesMap([land(5, 5), land(5, 4), land(5, 6), land(4, 5), land(6, 5), land(4, 4), land(6, 6), land(4, 6), land(6, 4)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(false);
  });

  it("returns false for a tile that is not land", () => {
    const tiles = tilesMap([sea(5, 5), sea(5, 6)]);
    expect(isCoastalLand(tiles, 5, 5)).toBe(false);
  });
});
