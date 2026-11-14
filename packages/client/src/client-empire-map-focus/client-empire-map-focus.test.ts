import { describe, expect, it } from "vitest";
import { hasSeenEmpireTile, nearestSeenEmpireTile } from "./client-empire-map-focus.js";

const tilesOf = (list: Array<{ x: number; y: number; ownerId?: string }>) =>
  new Map(list.map((t) => [`${t.x},${t.y}`, t]));

const world = { worldWidth: 100, worldHeight: 100 };

describe("nearestSeenEmpireTile", () => {
  it("picks the seen tile of the empire nearest the camera", () => {
    const tiles = tilesOf([
      { x: 40, y: 40, ownerId: "p2" },
      { x: 12, y: 10, ownerId: "p2" },
      { x: 11, y: 10, ownerId: "p3" }
    ]);
    const discovered = new Set(tiles.keys());
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: discovered, ownerId: "p2", from: { x: 10, y: 10 }, ...world })).toEqual({ x: 12, y: 10 });
  });

  it("measures across the world wrap", () => {
    const tiles = tilesOf([
      { x: 98, y: 5, ownerId: "p2" },
      { x: 20, y: 5, ownerId: "p2" }
    ]);
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: new Set(tiles.keys()), ownerId: "p2", from: { x: 2, y: 5 }, ...world })).toEqual({ x: 98, y: 5 });
  });

  it("returns nothing when no tile of the empire was ever seen", () => {
    const tiles = tilesOf([{ x: 5, y: 5, ownerId: "p3" }]);
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: new Set(tiles.keys()), ownerId: "p2", from: { x: 0, y: 0 }, ...world })).toBeUndefined();
  });

  it("ignores tiles the viewer never discovered, even when the client holds them", () => {
    const tiles = tilesOf([
      { x: 3, y: 3, ownerId: "p2" },
      { x: 30, y: 30, ownerId: "p2" }
    ]);
    const discovered = new Set(["30,30"]);
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: discovered, ownerId: "p2", from: { x: 0, y: 0 }, ...world })).toEqual({ x: 30, y: 30 });
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: new Set<string>(), ownerId: "p2", from: { x: 0, y: 0 }, ...world })).toBeUndefined();
  });

  it("counts a remembered tile under fog", () => {
    const tiles = new Map([["7,7", { x: 7, y: 7, ownerId: "p2", fogged: true }]]);
    expect(nearestSeenEmpireTile({ tiles, discoveredTiles: new Set(["7,7"]), ownerId: "p2", from: { x: 0, y: 0 }, ...world })).toEqual({ x: 7, y: 7 });
  });
});

describe("hasSeenEmpireTile", () => {
  it("is false until a tile of the empire is discovered, and recomputes when the revision moves", () => {
    const tiles = tilesOf([{ x: 3, y: 3, ownerId: "p2" }]);
    const discovered = new Set<string>();
    expect(hasSeenEmpireTile({ tiles, discoveredTiles: discovered, ownerId: "p2", revision: 1 })).toBe(false);
    discovered.add("3,3");
    expect(hasSeenEmpireTile({ tiles, discoveredTiles: discovered, ownerId: "p2", revision: 2 })).toBe(true);
    expect(hasSeenEmpireTile({ tiles, discoveredTiles: discovered, ownerId: "p9", revision: 2 })).toBe(false);
  });
});
