import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { AFC_FREE_REBUILD_MESSAGE, holdsTerritoryWithoutAfc, isAfcModuleWaitingForSlot, notifyIfLastAfcLost } from "./client-afc-slot-notices.js";

const EIGHT = ["a", "b", "c", "d", "e", "f", "g", "h"];
const afcTile = (x: number, modules: string[]): Tile =>
  ({ x, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active", activatedAt: x, modules, houseModules: modules } }) as Tile;
const stateOf = (tiles: Tile[]) => ({ me: "me", tiles: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])) });

describe("isAfcModuleWaitingForSlot", () => {
  it("is true only when the module is held nowhere and every owned AFC is full", () => {
    expect(isAfcModuleWaitingForSlot(stateOf([afcTile(0, EIGHT)]), "masonry")).toBe(true);
    expect(isAfcModuleWaitingForSlot(stateOf([afcTile(0, EIGHT), afcTile(1, [])]), "masonry")).toBe(false);
    // Already docked (the tile delta arrived before the tech update): not waiting.
    expect(isAfcModuleWaitingForSlot(stateOf([afcTile(0, [...EIGHT.slice(0, 7), "masonry"])]), "masonry")).toBe(false);
    expect(isAfcModuleWaitingForSlot(stateOf([]), "masonry")).toBe(false);
  });
});

describe("last AFC lost", () => {
  const plain = { x: 3, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;

  it("detects territory without an AFC", () => {
    expect(holdsTerritoryWithoutAfc(stateOf([plain]))).toBe(true);
    expect(holdsTerritoryWithoutAfc(stateOf([plain, afcTile(0, [])]))).toBe(false);
    expect(holdsTerritoryWithoutAfc(stateOf([]))).toBe(false);
  });

  it("tells the player they can rebuild for free only when the lost AFC was their last", () => {
    const pushFeed = vi.fn();
    notifyIfLastAfcLost(stateOf([plain]), pushFeed);
    expect(pushFeed).toHaveBeenCalledWith(AFC_FREE_REBUILD_MESSAGE, "combat", "warn");
    pushFeed.mockClear();
    notifyIfLastAfcLost(stateOf([plain, afcTile(0, [])]), pushFeed);
    expect(pushFeed).not.toHaveBeenCalled();
  });
});
