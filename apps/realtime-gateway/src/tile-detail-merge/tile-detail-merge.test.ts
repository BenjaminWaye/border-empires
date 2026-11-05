import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { mergeTileDetailIntoSnapshot } from "./tile-detail-merge.js";

describe("mergeTileDetailIntoSnapshot", () => {
  it("overlays fresh tile fields on the cached tile", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [{ x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }]
    };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [
      { x: 74, y: 414, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
    ];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined);

    expect(merged.tiles).toEqual(fresh);
  });

  it("still appends a fresh tile not present in the cached snapshot", () => {
    const snapshot: PlayerSubscriptionSnapshot = { playerId: "player-1", tiles: [] };
    const fresh: PlayerSubscriptionSnapshot["tiles"] = [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1" }];

    const merged = mergeTileDetailIntoSnapshot(snapshot, fresh, undefined);

    expect(merged.tiles).toEqual(fresh);
  });
});
