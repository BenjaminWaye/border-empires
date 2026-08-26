import { describe, expect, it } from "vitest";

import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";

// Regression for the auto-settle bug reported 2026-08-25: a resource tile
// claimed outside the player's reach border (frontierDecayKind ===
// "OUT_OF_REACH") was still being queued for auto-settle, so the client
// kept firing a SETTLE command the server always rejects with OUT_OF_REACH.
// A captured town/dock anchor out of reach is deliberately NOT covered by
// this queue -- that case auto-settles (or decays) synchronously at
// capture-resolution time; see canAutoSettleCapturedAnchor in
// runtime-out-of-reach-auto-settle.ts.
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
      territoryTileKeys: ["10,10", "11,10", "12,10"]
    };
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        // In-reach resource tile — eligible for auto-settle.
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" },
        // Claimed outside reach (server SETTLE rejects with OUT_OF_REACH) — must not be queued.
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          resource: "TITANIUM",
          frontierDecayAt: 999_999,
          frontierDecayKind: "OUT_OF_REACH"
        }
      ],
      players: [livePlayer],
      pendingSettlements: [],
      activeLocks: []
    });

    expect(snapshot.player?.autoSettlementQueue).toEqual([{ x: 11, y: 10 }]);
  });
});
