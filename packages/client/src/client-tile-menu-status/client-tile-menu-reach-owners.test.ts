import { tileKey } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { foreignOwnersReachingTile, reachOwnerIdsForTile } from "./client-tile-menu-reach-owners.js";

const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...overrides }) as Tile;

const mapOf = (...tiles: Tile[]): Map<string, Tile> => new Map(tiles.map((t) => [tileKey(t.x, t.y), t]));

const enemyTown = (x: number, y: number, ownerId: string): Tile =>
  tile(x, y, { ownerId, ownershipState: "SETTLED", townType: "MARKET" } as Partial<Tile>);

describe("foreignOwnersReachingTile", () => {
  const mine = tile(50, 50, { ownerId: "me", ownershipState: "FRONTIER" });

  it("names a foreign owner whose town disk covers the tile", () => {
    const tiles = mapOf(mine, enemyTown(52, 51, "rival"));
    expect(foreignOwnersReachingTile(tiles, mine, "me")).toEqual(["rival"]);
  });

  it("ignores foreign towns whose disk does not reach the tile", () => {
    const tiles = mapOf(mine, enemyTown(54, 50, "rival"));
    expect(foreignOwnersReachingTile(tiles, mine, "me")).toEqual([]);
  });

  it("ignores foreign frontier tiles (not live anchors) and the viewer's own anchors", () => {
    const tiles = mapOf(
      mine,
      tile(51, 50, { ownerId: "rival", ownershipState: "FRONTIER", townType: "MARKET" } as Partial<Tile>),
      enemyTown(49, 50, "me")
    );
    expect(foreignOwnersReachingTile(tiles, mine, "me")).toEqual([]);
  });

  it("lists each covering owner once, even with several anchors", () => {
    const tiles = mapOf(mine, enemyTown(52, 50, "rival"), enemyTown(48, 50, "rival"), enemyTown(50, 52, "other"));
    expect(foreignOwnersReachingTile(tiles, mine, "me").sort()).toEqual(["other", "rival"]);
  });
});

describe("reachOwnerIdsForTile", () => {
  it("names the server's reach owner when no covering anchor is visible", () => {
    const mine = tile(50, 50, { ownerId: "me", ownershipState: "FRONTIER", reachOwnerId: "rival" });
    expect(reachOwnerIdsForTile(mapOf(mine), mine, "me")).toEqual(["rival"]);
  });

  it("leads with the server's owner and appends other local owners once", () => {
    const mine = tile(50, 50, { ownerId: "me", ownershipState: "FRONTIER", reachOwnerId: "rival" });
    const tiles = mapOf(mine, enemyTown(52, 50, "other"), enemyTown(48, 50, "rival"));
    expect(reachOwnerIdsForTile(tiles, mine, "me")).toEqual(["rival", "other"]);
  });

  it("ignores a barbarian server stamp, like the map's incursion hatch", () => {
    const mine = tile(50, 50, { ownerId: "me", ownershipState: "FRONTIER", reachOwnerId: "barbarian-1" });
    expect(reachOwnerIdsForTile(mapOf(mine), mine, "me")).toEqual([]);
  });

  it("ignores a server stamp naming the viewer", () => {
    const mine = tile(50, 50, { ownerId: "me", ownershipState: "FRONTIER", reachOwnerId: "me" });
    expect(reachOwnerIdsForTile(mapOf(mine), mine, "me")).toEqual([]);
  });
});
