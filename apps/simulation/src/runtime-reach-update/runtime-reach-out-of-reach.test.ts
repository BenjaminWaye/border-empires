import type { DomainTileState } from "@border-empires/game-domain";
import { TOWN_REACH_RADIUS, type ReachAnchor } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { clearLegacyOutOfReachDecayStamps, isTileBeyondReach, type BeyondReachContext } from "./runtime-reach-out-of-reach.js";

const reachContext = (inReach: boolean, anchors: ReachAnchor[]): BeyondReachContext => ({
  isPlayerTileInReach: () => inReach,
  gatherReachAnchors: () => anchors
});

describe("isTileBeyondReach", () => {
  it("is false for a tile inside the player's own reach", () => {
    expect(isTileBeyondReach(reachContext(true, []), "p1", 10, 10)).toBe(false);
  });

  it("is true for a tile in no-man's-land", () => {
    expect(isTileBeyondReach(reachContext(false, []), "p1", 10, 10)).toBe(true);
  });

  it("is true when only one other player's reach covers the tile", () => {
    // A single rival's reach is not a contest.
    const anchors: ReachAnchor[] = [{ x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" }];
    expect(isTileBeyondReach(reachContext(false, anchors), "p1", 10, 10)).toBe(true);
  });

  it("is false in an actively contested reach zone (2+ owners overlap)", () => {
    const anchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" },
      { x: 10 + TOWN_REACH_RADIUS, y: 10, ownerId: "p3", activatedAt: 1, kind: "TOWN" }
    ];
    expect(isTileBeyondReach(reachContext(false, anchors), "p1", 10, 10)).toBe(false);
  });
});

describe("clearLegacyOutOfReachDecayStamps", () => {
  it("strips persisted OUT_OF_REACH timers and leaves every other tile alone", () => {
    // Regression: snapshots written before out-of-reach decay was removed
    // still carry the timer. Left in place it would show a dead countdown on
    // the client forever (nothing expires it any more).
    const tiles = new Map<string, DomainTileState>([
      ["1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", frontierDecayAt: 99_000, frontierDecayKind: "OUT_OF_REACH" }],
      ["2,1", { x: 2, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }],
      ["3,1", { x: 3, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", frontierDecayAt: 50_000, frontierDecayKind: "ENCIRCLEMENT" }]
    ]);
    const writes: string[] = [];

    const cleared = clearLegacyOutOfReachDecayStamps(tiles, (tileKey, tile) => {
      writes.push(tileKey);
      tiles.set(tileKey, tile);
    });

    expect(writes).toEqual(["1,1"]);
    expect(cleared.map((tile) => `${tile.x},${tile.y}`)).toEqual(["1,1"]);
    expect(tiles.get("1,1")).toMatchObject({ ownerId: "p1", ownershipState: "FRONTIER", frontierDecayAt: undefined, frontierDecayKind: undefined });
    expect(tiles.get("3,1")?.frontierDecayKind).toBe("ENCIRCLEMENT");
  });
});
