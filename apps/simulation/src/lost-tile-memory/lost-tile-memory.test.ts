import { describe, expect, it } from "vitest";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { lostTilesOf } from "./lost-tile-memory.js";

const flip = (x: number, fromOwner: string | undefined, toOwner: string | undefined, at: number): TerritoryFlip => ({ tileId: `${x},0`, x, y: 0, fromOwner, toOwner, at });

describe("lostTilesOf", () => {
  it("names who took each tile from the player, newest loss first", () => {
    expect(lostTilesOf("me", [flip(1, "me", "barbarian-1", 10), flip(2, "me", "rival", 20), flip(3, "rival", "barbarian-1", 30)])).toEqual([
      { x: 2, y: 0, ownerId: "rival" },
      { x: 1, y: 0, ownerId: "barbarian-1" }
    ]);
  });

  it("drops a tile the player has since won back, and keeps the captor they saw, not a later change of hands", () => {
    const flips = [flip(1, "me", "rival", 10), flip(1, "rival", "me", 20), flip(2, "me", "rival", 10), flip(2, "rival", "barbarian-1", 30)];
    expect(lostTilesOf("me", flips)).toEqual([{ x: 2, y: 0, ownerId: "rival" }]);
  });

  it("ignores land that went neutral and caps the list", () => {
    expect(lostTilesOf("me", [flip(1, "me", undefined, 10)])).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => flip(i, "me", "rival", i));
    expect(lostTilesOf("me", many, 3).map((t) => t.x)).toEqual([9, 8, 7]);
  });
});
