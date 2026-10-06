import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import {
  AFC_NO_LANDING_SITE_MESSAGE,
  AFC_NO_SITE_CHECK_DELAY_MS,
  holdsTerritoryWithoutAfc,
  isAfcModuleWaitingForSlot,
  scheduleAfcNoLandingSiteCheck
} from "./client-afc-slot-notices.js";

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

describe("no landing site warning", () => {
  it("detects territory without an AFC", () => {
    const plain = { x: 3, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    expect(holdsTerritoryWithoutAfc(stateOf([plain]))).toBe(true);
    expect(holdsTerritoryWithoutAfc(stateOf([plain, afcTile(0, [])]))).toBe(false);
    expect(holdsTerritoryWithoutAfc(stateOf([]))).toBe(false);
  });

  it("warns after the delay only if no replacement AFC has landed by then", () => {
    const plain = { x: 3, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    const state = stateOf([plain]);
    const pushFeed = vi.fn();
    const tasks: Array<() => void> = [];
    scheduleAfcNoLandingSiteCheck(state, pushFeed, (task, delayMs) => { expect(delayMs).toBe(AFC_NO_SITE_CHECK_DELAY_MS); tasks.push(task); });
    scheduleAfcNoLandingSiteCheck(state, pushFeed, (task) => { tasks.push(task); });
    tasks[0]!();
    expect(pushFeed).toHaveBeenCalledWith(AFC_NO_LANDING_SITE_MESSAGE, "combat", "warn");
    state.tiles.set("0,0", afcTile(0, [])); // replacement landed
    pushFeed.mockClear();
    tasks[1]!();
    expect(pushFeed).not.toHaveBeenCalled();
  });
});
