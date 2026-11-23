import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { applyLostTileMemory } from "./client-lost-tile-memory.js";

const fresh = (tiles: Array<[string, Tile]> = []) => ({ tiles: new Map(tiles), discoveredTiles: new Set<string>(), tilesRevision: 0 });

// Playtest Run 4: land lost far from your territory showed as unowned fog after logging back in.
describe("applyLostTileMemory", () => {
  it("paints a lost tile the client has no data for as fogged land of whoever took it", () => {
    const state = fresh();
    expect(applyLostTileMemory(state, [{ x: 4, y: 5, ownerId: "barbarian-1" }])).toBe(1);
    expect(state.tiles.get("4,5")).toMatchObject({ ownerId: "barbarian-1", ownershipState: "FRONTIER", fogged: true, terrain: "LAND" });
    expect(state.discoveredTiles.has("4,5")).toBe(true);
    expect(state.tilesRevision).toBe(1);
  });

  it("fills in an ownerless fogged tile but never overrides a tile in sight or one already remembered with an owner", () => {
    const state = fresh([
      ["1,1", { x: 1, y: 1, terrain: "LAND", fogged: true }],
      ["2,2", { x: 2, y: 2, terrain: "LAND", fogged: false, ownerId: "me" }],
      ["3,3", { x: 3, y: 3, terrain: "LAND", fogged: true, ownerId: "rival" }]
    ]);
    applyLostTileMemory(state, [{ x: 1, y: 1, ownerId: "barbarian-1" }, { x: 2, y: 2, ownerId: "barbarian-1" }, { x: 3, y: 3, ownerId: "barbarian-1" }]);
    expect(state.tiles.get("1,1")?.ownerId).toBe("barbarian-1");
    expect(state.tiles.get("2,2")?.ownerId).toBe("me");
    expect(state.tiles.get("3,3")?.ownerId).toBe("rival");
  });

  it("ignores a missing or malformed list", () => {
    const state = fresh();
    expect(applyLostTileMemory(state, undefined)).toBe(0);
    expect(applyLostTileMemory(state, [{ x: 1.5, y: 2, ownerId: "a" }, { x: 1, y: 2, ownerId: "" }, "3,4"])).toBe(0);
    expect(state.tilesRevision).toBe(0);
  });
});
