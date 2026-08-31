import type { PlayerSubscriptionDock } from "@border-empires/sim-protocol";

// Wire shape for border_empires.simulation.DockRoute. The gRPC server is
// loaded with keepCase: true, so snake_case field names go out as-is.
export type ProtoDockRouteOut = {
  dock_id: string;
  tile_key: string;
  paired_dock_id: string;
  connected_dock_ids?: string[];
  routes?: Array<{ linked_dock_id: string; waypoints: Array<{ x: number; y: number }> }>;
};

// Marshals the runtime's docks onto the wire, including the sea routes
// computed at worldgen time over the season's frozen terrain. Routes must
// survive this hop: the client's own procedural terrainAt() drifts from a
// season's frozen terrain whenever the bundled worldgen algorithm changes
// (e.g. the islands mapgen rework), so without the server's route the client
// cannot reliably re-derive one and draws no dock line at all.
export const marshalDocksToProto = (docks: readonly PlayerSubscriptionDock[]): ProtoDockRouteOut[] =>
  docks.map((dock) => {
    // A single waypoint cannot form a polyline; drop those rather than send
    // an undrawable route the client would have to defend against.
    const routeEntries = Object.entries(dock.routeWaypointsByLinkedDockId ?? {}).filter(
      ([, waypoints]) => waypoints.length >= 2
    );
    return {
      dock_id: dock.dockId,
      tile_key: dock.tileKey,
      paired_dock_id: dock.pairedDockId,
      ...(dock.connectedDockIds?.length ? { connected_dock_ids: [...dock.connectedDockIds] } : {}),
      ...(routeEntries.length
        ? {
            routes: routeEntries.map(([linkedDockId, waypoints]) => ({
              linked_dock_id: linkedDockId,
              waypoints: waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y }))
            }))
          }
        : {})
    };
  });
