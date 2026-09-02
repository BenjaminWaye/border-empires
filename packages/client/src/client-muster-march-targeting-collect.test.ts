import { describe, expect, it } from "vitest";
import { listMarchTargets, findMarchOriginsForTarget } from "./client-muster-march-targeting.js";
import type { Tile } from "./client-types.js";

const marchTile = (x: number, y: number, targetX: number, targetY: number, ownerId = "me"): Tile =>
  ({ x, y, terrain: "LAND", ownerId, muster: { ownerId, amount: 10, mode: "MARCH", targetX, targetY, updatedAt: 0 } }) as Tile;

describe("listMarchTargets", () => {
  it("lists the destination of an own MARCH flag", () => {
    const tiles = new Map<string, Tile>([["0,0", marchTile(0, 0, 5, 5)]]);
    expect(listMarchTargets({ tiles, me: "me" })).toEqual([{ originX: 0, originY: 0, targetX: 5, targetY: 5 }]);
  });

  it("ignores HOLD/ADVANCE flags and flags belonging to other players", () => {
    const tiles = new Map<string, Tile>([
      ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me", muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 } } as Tile],
      ["1,1", marchTile(1, 1, 9, 9, "rival")]
    ]);
    expect(listMarchTargets({ tiles, me: "me" })).toHaveLength(0);
  });

  it("lists every own flag when two share the same destination, in stable origin order", () => {
    const tiles = new Map<string, Tile>([
      ["3,3", marchTile(3, 3, 9, 9)],
      ["1,1", marchTile(1, 1, 9, 9)]
    ]);
    expect(listMarchTargets({ tiles, me: "me" })).toEqual([
      { originX: 1, originY: 1, targetX: 9, targetY: 9 },
      { originX: 3, originY: 3, targetX: 9, targetY: 9 }
    ]);
  });
});

describe("findMarchOriginsForTarget", () => {
  it("finds the owning muster tile marching toward the given target", () => {
    const tiles = new Map<string, Tile>([["2,2", marchTile(2, 2, 7, 7)]]);
    expect(findMarchOriginsForTarget({ tiles, me: "me" }, 7, 7)).toEqual([{ originX: 2, originY: 2 }]);
  });

  it("returns every origin when multiple flags share a target", () => {
    const tiles = new Map<string, Tile>([
      ["2,2", marchTile(2, 2, 7, 7)],
      ["0,0", marchTile(0, 0, 7, 7)]
    ]);
    expect(findMarchOriginsForTarget({ tiles, me: "me" }, 7, 7)).toEqual([
      { originX: 0, originY: 0 },
      { originX: 2, originY: 2 }
    ]);
  });

  it("returns an empty array when nothing is marching there", () => {
    const tiles = new Map<string, Tile>();
    expect(findMarchOriginsForTarget({ tiles, me: "me" }, 7, 7)).toEqual([]);
  });
});
