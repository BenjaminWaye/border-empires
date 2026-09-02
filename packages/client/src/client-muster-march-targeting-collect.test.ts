import { describe, expect, it, vi } from "vitest";
import { listMarchTargets, findMarchOriginsForTarget, cancelMarchAction } from "./client-muster-march-targeting.js";
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

describe("cancelMarchAction", () => {
  // Regression: a tile can simultaneously be one flag's origin (e.g.
  // (5,5)->(9,9)) and another flag's destination (e.g. (2,2)->(5,5)).
  // Clicking "Cancel March from (2,2)" (actionId "muster_march_cancel_2")
  // while (5,5) is selected used to unconditionally cancel (5,5)'s own
  // outgoing march instead, because the selected-tile-has-an-outgoing-march
  // check short-circuited before actionId was ever consulted.
  it("cancels the flag actionId names, not always the selected tile's own outgoing march", () => {
    const tiles = new Map<string, Tile>([
      ["5,5", marchTile(5, 5, 9, 9)],
      ["2,2", marchTile(2, 2, 5, 5)]
    ]);
    const selected = tiles.get("5,5")!;
    const sendGameMessage = vi.fn(() => true);
    const pushFeed = vi.fn();

    cancelMarchAction({ tiles, me: "me" }, selected, "muster_march_cancel_2", { sendGameMessage, pushFeed });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 2, y: 2, mode: "HOLD" });
  });

  it("cancels the selected tile's own outgoing march for the base action id", () => {
    const tiles = new Map<string, Tile>([
      ["5,5", marchTile(5, 5, 9, 9)],
      ["2,2", marchTile(2, 2, 5, 5)]
    ]);
    const selected = tiles.get("5,5")!;
    const sendGameMessage = vi.fn(() => true);
    const pushFeed = vi.fn();

    cancelMarchAction({ tiles, me: "me" }, selected, "muster_march_cancel", { sendGameMessage, pushFeed });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_MUSTER", x: 5, y: 5, mode: "HOLD" });
  });
});
