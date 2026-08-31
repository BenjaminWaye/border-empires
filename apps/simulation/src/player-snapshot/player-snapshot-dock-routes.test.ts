import { describe, expect, it } from "vitest";

import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";

// Regression for a wire-drop bug: PlayerSubscriptionDock (sim-protocol) and
// RuntimeExportState's docks shape both lacked routeWaypointsByLinkedDockId,
// so buildPlayerSubscriptionSnapshot silently stripped the server-computed
// sea route before it ever reached the gateway, even though the route had
// been correctly computed and attached on the runtime dock. Client fell back
// to its own (deliberately unreliable) A*, so no dashed line rendered.
describe("buildPlayerSubscriptionSnapshot dock route waypoints", () => {
  it("carries a dock's server-computed sea route waypoints through to the subscription snapshot", () => {
    const route = [
      { x: 11, y: 10 },
      { x: 12, y: 10 },
      { x: 90, y: 91 }
    ];
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
        { x: 90, y: 90, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-b" }
      ],
      players: [
        {
          id: "player-1",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: [],
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", routeWaypointsByLinkedDockId: { "dock-b": route } },
        { dockId: "dock-b", tileKey: "90,90", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ]
    });

    expect(snapshot.docks?.find((dock) => dock.dockId === "dock-a")?.routeWaypointsByLinkedDockId).toEqual({
      "dock-b": route
    });
  });
});
