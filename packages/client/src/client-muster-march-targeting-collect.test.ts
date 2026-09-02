import { describe, expect, it } from "vitest";
import { collectMarchTargets, findMarchOriginForTarget } from "./client-muster-march-targeting.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const marchTile = (x: number, y: number, targetX: number, targetY: number, ownerId = "me"): Tile =>
  ({ x, y, terrain: "LAND", ownerId, muster: { ownerId, amount: 10, mode: "MARCH", targetX, targetY, updatedAt: 0 } }) as Tile;

describe("collectMarchTargets", () => {
  it("collects the destination tile of an own MARCH flag", () => {
    const tiles = new Map<string, Tile>([["0,0", marchTile(0, 0, 5, 5)]]);
    const result = collectMarchTargets({ tiles, me: "me" }, keyFor);
    expect(result.get(keyFor(5, 5))).toEqual({ originX: 0, originY: 0 });
  });

  it("ignores HOLD/ADVANCE flags and flags belonging to other players", () => {
    const tiles = new Map<string, Tile>([
      ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me", muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 } } as Tile],
      ["1,1", marchTile(1, 1, 9, 9, "rival")]
    ]);
    expect(collectMarchTargets({ tiles, me: "me" }, keyFor).size).toBe(0);
  });
});

describe("findMarchOriginForTarget", () => {
  it("finds the owning muster tile marching toward the given target", () => {
    const tiles = new Map<string, Tile>([["2,2", marchTile(2, 2, 7, 7)]]);
    expect(findMarchOriginForTarget({ tiles, me: "me" }, 7, 7)).toEqual({ originX: 2, originY: 2 });
  });

  it("returns undefined when nothing is marching there", () => {
    const tiles = new Map<string, Tile>();
    expect(findMarchOriginForTarget({ tiles, me: "me" }, 7, 7)).toBeUndefined();
  });
});
