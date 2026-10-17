import { describe, expect, it } from "vitest";

import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";

// Regression for the auto-settle bug reported 2026-08-25: a resource tile
// claimed outside the player's reach border was still being queued for
// auto-settle, so the client kept firing a SETTLE command the server always
// rejects with OUT_OF_REACH. That guard used to key off the tile's
// OUT_OF_REACH decay stamp; out-of-reach frontier no longer decays, so it now
// keys off the tile's reach-border owner instead. A captured town/dock anchor
// out of reach is deliberately NOT covered by this queue -- that case
// auto-settles synchronously at capture-resolution time; see
// canAutoSettleCapturedAnchor in runtime-out-of-reach-auto-settle.ts.
describe("buildPlayerSubscriptionSnapshot auto-settlement queue", () => {
  it("excludes out-of-reach frontier tiles from the auto-settlement queue", () => {
    const livePlayer = {
      id: "player-1",
      name: "Nauticus",
      points: 64,
      manpower: 120,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0,
      territoryTileKeys: ["10,10", "11,10", "12,10", "10,11"]
    };
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        // In-reach resource tile — eligible for auto-settle.
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM", reachOwnerId: "player-1" },
        // Claimed outside reach (server SETTLE rejects with OUT_OF_REACH) — must not be queued.
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          resource: "TITANIUM"
        },
        // Next to the town but inside a rival's reach border, not ours -- also unsettleable.
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM", reachOwnerId: "player-2" }
      ],
      players: [livePlayer],
      pendingSettlements: [],
      activeLocks: []
    });

    expect(snapshot.player?.autoSettlementQueue).toEqual([{ x: 11, y: 10 }]);
  });
});
