import { describe, expect, it } from "vitest";

import { buildPlannerTileSlice } from "./planner-world-view-slice.js";

type MinimalTile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  ownerId?: string;
  ownershipState?: string;
};

const tileMap = (tiles: MinimalTile[]): Map<string, MinimalTile> =>
  new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

describe("buildPlannerTileSlice", () => {
  it("scopes planner tiles to player territory neighborhoods instead of the whole world", () => {
    const tiles = tileMap([
      { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      { x: 2, y: 2, terrain: "LAND" },
      { x: 3, y: 3, terrain: "LAND" }
    ]);

    const slice = buildPlannerTileSlice({
      playerIds: ["p1"],
      tiles,
      summaryForPlayer: () => ({ territoryTileKeys: new Set(["0,0"]) }),
      radius: 2
    });

    const keys = new Set(slice.map((tile) => `${tile.x},${tile.y}`));
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("2,2")).toBe(true);
    expect(keys.has("3,3")).toBe(false);
  });

  it("unions planner slices across requested players", () => {
    const tiles = tileMap([
      { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      { x: 10, y: 10, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" },
      { x: 5, y: 5, terrain: "LAND" }
    ]);

    const slice = buildPlannerTileSlice({
      playerIds: ["p1", "p2"],
      tiles,
      summaryForPlayer: (playerId) =>
        playerId === "p1"
          ? { territoryTileKeys: new Set(["0,0"]) }
          : { territoryTileKeys: new Set(["10,10"]) },
      radius: 0
    });

    expect(slice.map((tile) => `${tile.x},${tile.y}`)).toEqual(["0,0", "10,10"]);
  });
});
