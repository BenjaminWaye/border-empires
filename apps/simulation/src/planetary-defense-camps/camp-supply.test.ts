import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { campTilesCutOff } from "./camp-supply.js";

const key = (x: number, y: number) => `${x},${y}`;

const world = (tiles: DomainTileState[]): Map<string, DomainTileState> => new Map(tiles.map((tile) => [key(tile.x, tile.y), tile]));
const campTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED", campId: key(x, y), ...extra
});
const land = (x: number, y: number, campId: string, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "FRONTIER", campId, ...extra
});
const members = (tiles: Map<string, DomainTileState>, campId: string): Set<string> =>
  new Set([...tiles].filter(([, tile]) => tile.campId === campId).map(([k]) => k));

describe("campTilesCutOff", () => {
  it("keeps land connected to its camp (diagonals count) and cuts the rest", () => {
    const tiles = world([campTile(10, 10), land(11, 11, "10,10"), land(12, 12, "10,10"), land(20, 20, "10,10")]);
    expect(campTilesCutOff({ campId: "10,10", members: members(tiles, "10,10"), tiles, dockLinksByDockTileKey: new Map() })).toEqual(["20,20"]);
  });

  it("does not use another camp's land as a road", () => {
    const tiles = world([campTile(10, 10), land(12, 10, "10,10"), campTile(11, 10)]);
    expect(campTilesCutOff({ campId: "10,10", members: members(tiles, "10,10"), tiles, dockLinksByDockTileKey: new Map() })).toEqual(["12,10"]);
  });

  it("a fallen camp loses all of its land", () => {
    const tiles = world([land(11, 10, "10,10"), land(12, 10, "10,10"), { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }]);
    expect(campTilesCutOff({ campId: "10,10", members: members(tiles, "10,10"), tiles, dockLinksByDockTileKey: new Map() }).sort()).toEqual(["11,10", "12,10"]);
  });

  it("a camp on a dock supplies its landing ground across the water", () => {
    const sea = (x: number, y: number): DomainTileState => ({ x, y, terrain: "SEA" });
    const tiles = world([
      campTile(10, 10, { dockId: "dock-a" }),
      sea(11, 10), sea(12, 10), sea(13, 10),
      { x: 30, y: 10, terrain: "LAND", dockId: "dock-b" },
      sea(30, 11), sea(31, 11),
      land(31, 10, "10,10"),
      land(40, 40, "10,10") // inland and unconnected: cut off
    ]);
    const cutOff = campTilesCutOff({ campId: "10,10", members: members(tiles, "10,10"), tiles, dockLinksByDockTileKey: new Map([["10,10", ["30,10"]]]) });
    expect(cutOff).toEqual(["40,40"]);
  });
});
