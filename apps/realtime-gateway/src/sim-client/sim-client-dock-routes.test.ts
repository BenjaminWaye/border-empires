import { describe, expect, it } from "vitest";

import { normalizeProtoDock } from "./sim-client-dock-normalize.js";

// Regression for the last hop in the dock sea-route chain. The route is
// computed at worldgen time over the season's frozen terrain and carried
// through the sim's snapshot, but the sim->gateway hop is protobuf, which
// silently drops anything the schema doesn't declare. DockRoute had no route
// field and normalizeProtoDock never read one, so the route died here and the
// client fell back to re-deriving terrain procedurally -- which no longer
// matches seasons generated before the islands mapgen rework, so no dashed
// line rendered at all.
describe("normalizeProtoDock sea routes", () => {
  it("carries server-computed route waypoints off the wire, keyed by linked dock id", () => {
    const normalized = normalizeProtoDock({
      dock_id: "dock-10",
      tile_key: "12,61",
      paired_dock_id: "dock-88",
      connected_dock_ids: ["dock-88"],
      routes: [
        {
          linked_dock_id: "dock-88",
          waypoints: [
            { x: 12, y: 62 },
            { x: 12, y: 63 },
            { x: 13, y: 64 }
          ]
        }
      ]
    });

    expect(normalized?.routeWaypointsByLinkedDockId).toEqual({
      "dock-88": [
        { x: 12, y: 62 },
        { x: 12, y: 63 },
        { x: 13, y: 64 }
      ]
    });
  });

  it("accepts camelCase field names, as protobuf runtimes may emit either casing", () => {
    const normalized = normalizeProtoDock({
      dockId: "dock-a",
      tileKey: "1,1",
      pairedDockId: "dock-b",
      routes: [{ linkedDockId: "dock-b", waypoints: [{ x: 1, y: 2 }, { x: 1, y: 3 }] }]
    });

    expect(normalized?.routeWaypointsByLinkedDockId).toEqual({ "dock-b": [{ x: 1, y: 2 }, { x: 1, y: 3 }] });
  });

  it("omits the field entirely when the sim ships no routes, so the client falls back cleanly", () => {
    const normalized = normalizeProtoDock({
      dock_id: "dock-a",
      tile_key: "1,1",
      paired_dock_id: "dock-b"
    });

    expect(normalized).toEqual({ dockId: "dock-a", tileKey: "1,1", pairedDockId: "dock-b" });
    expect(normalized).not.toHaveProperty("routeWaypointsByLinkedDockId");
  });

  it("drops a degenerate single-waypoint route rather than passing an undrawable polyline through", () => {
    const normalized = normalizeProtoDock({
      dock_id: "dock-a",
      tile_key: "1,1",
      paired_dock_id: "dock-b",
      routes: [{ linked_dock_id: "dock-b", waypoints: [{ x: 1, y: 2 }] }]
    });

    expect(normalized).not.toHaveProperty("routeWaypointsByLinkedDockId");
  });
});
