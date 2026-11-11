import { describe, expect, it } from "vitest";
import type { RuntimeExportState } from "../runtime-state-export.js";
import { computeLongestRoad, findMostDeadlyTile } from "./season-stats.js";

const players = [{ id: "p1", name: "Waypoint" }, { id: "p2", name: "Rival" }];
describe("season record details", () => {
  it("identifies the road owner and named endpoint cities", () => {
    const tiles: RuntimeExportState["tiles"] = [
      { x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townPopulationTier: "CITY", townName: "Port Brass" },
      { x: 2, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" },
      { x: 3, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townPopulationTier: "TOWN", townName: "Northgate" }
    ];
    const result = computeLongestRoad(tiles, players);
    expect(result).toMatchObject({ tileCount: 3, playerId: "p1", playerName: "Waypoint" });
    expect([result?.fromCity?.name, result?.toCity?.name].sort()).toEqual(["Northgate", "Port Brass"]);
    expect([result?.fromCity?.x, result?.toCity?.x].sort()).toEqual([1, 3]);
  });

  it("does not invent a player attribution for old aggregate-only losses", () => {
    expect(findMostDeadlyTile(new Map([["3,4", 500]]), players)?.mostLossesPlayer).toBeUndefined();
  });
});
