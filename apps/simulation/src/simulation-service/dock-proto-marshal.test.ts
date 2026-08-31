import { describe, expect, it } from "vitest";

import { marshalDocksToProto } from "./dock-proto-marshal.js";

describe("marshalDocksToProto", () => {
  it("puts the server-computed sea route on the wire, keyed by linked dock id", () => {
    const [dock] = marshalDocksToProto([
      {
        dockId: "dock-10",
        tileKey: "12,61",
        pairedDockId: "dock-88",
        connectedDockIds: ["dock-88"],
        routeWaypointsByLinkedDockId: {
          "dock-88": [
            { x: 12, y: 62 },
            { x: 12, y: 63 }
          ]
        }
      }
    ]);

    expect(dock?.routes).toEqual([
      {
        linked_dock_id: "dock-88",
        waypoints: [
          { x: 12, y: 62 },
          { x: 12, y: 63 }
        ]
      }
    ]);
  });

  it("omits routes entirely for a dock the server has no route for", () => {
    const [dock] = marshalDocksToProto([{ dockId: "dock-a", tileKey: "1,1", pairedDockId: "dock-b" }]);

    expect(dock).toEqual({ dock_id: "dock-a", tile_key: "1,1", paired_dock_id: "dock-b" });
    expect(dock).not.toHaveProperty("routes");
  });

  it("drops a single-waypoint route rather than sending an undrawable polyline", () => {
    const [dock] = marshalDocksToProto([
      { dockId: "dock-a", tileKey: "1,1", pairedDockId: "dock-b", routeWaypointsByLinkedDockId: { "dock-b": [{ x: 1, y: 2 }] } }
    ]);

    expect(dock).not.toHaveProperty("routes");
  });
});
