import { describe, expect, it } from "vitest";

import type { DomainTileState } from "@border-empires/game-domain";
import {
  assignedTownKeyForSupportTile,
  economicStructureForSupportedTown,
  firstAvailableTownSupportTile,
  supportedTownKeysForTile
} from "./runtime-structure-support.js";

function tile(input: Omit<DomainTileState, "terrain"> & Pick<Partial<DomainTileState>, "terrain">): DomainTileState {
  return { terrain: "LAND", ...input };
}

function tileMap(tiles: DomainTileState[]): Map<string, DomainTileState> {
  return new Map(tiles.map((entry) => [`${entry.x},${entry.y}`, entry]));
}

describe("runtime structure support helpers", () => {
  it("assigns each support tile to one non-settlement town and filters supported structures by that assignment", () => {
    const tiles = tileMap([
      tile({
        x: 9,
        y: 10,
        ownerId: "player-1",
        ownershipState: "SETTLED",
        town: { type: "TOWN", populationTier: "TOWN" }
      }),
      tile({
        x: 10,
        y: 9,
        ownerId: "player-1",
        ownershipState: "SETTLED",
        town: { type: "TOWN", populationTier: "SETTLEMENT" }
      }),
      tile({
        x: 11,
        y: 10,
        ownerId: "player-1",
        ownershipState: "SETTLED",
        town: { type: "TOWN", populationTier: "CITY" }
      }),
      tile({
        x: 10,
        y: 10,
        ownerId: "player-1",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "player-1", type: "FUR_SYNTHESIZER", status: "active" }
      }),
      tile({
        x: 9,
        y: 9,
        ownerId: "player-1",
        ownershipState: "SETTLED",
        resource: "FUR"
      })
    ]);

    expect(assignedTownKeyForSupportTile(tiles, "player-1", 10, 10)).toBe("9,10");
    expect(supportedTownKeysForTile(tiles, "player-1", 10, 10)).toEqual(["9,10"]);
    expect(economicStructureForSupportedTown(tiles, "player-1", "9,10", "FUR_SYNTHESIZER")?.x).toBe(10);
    expect(economicStructureForSupportedTown(tiles, "player-1", "11,10", "FUR_SYNTHESIZER")).toBeUndefined();
    expect(firstAvailableTownSupportTile(tiles, "player-1", "9,10", "FUR_SYNTHESIZER")?.x).toBe(9);
    expect(firstAvailableTownSupportTile(tiles, "player-1", "11,10", "FUR_SYNTHESIZER")).toBeUndefined();
  });
});
