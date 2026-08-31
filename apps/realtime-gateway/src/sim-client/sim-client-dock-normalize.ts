import type { PlayerSubscriptionDock } from "@border-empires/sim-protocol";

// Wire shapes for border_empires.simulation.DockRoute. @grpc/proto-loader is
// configured with keepCase: true, but both casings are accepted here so the
// normalizer stays correct if that option ever changes.
export type ProtoDockRouteWaypoint = { x?: number; y?: number };

export type ProtoDockLinkedRoute = {
  linked_dock_id?: string;
  linkedDockId?: string;
  waypoints?: ProtoDockRouteWaypoint[];
};

export type ProtoDockRoute = {
  dock_id?: string;
  dockId?: string;
  tile_key?: string;
  tileKey?: string;
  paired_dock_id?: string;
  pairedDockId?: string;
  connected_dock_ids?: string[];
  connectedDockIds?: string[];
  routes?: ProtoDockLinkedRoute[];
};

// Turns one wire dock into the gateway's PlayerSubscriptionDock. The sea
// routes are computed at worldgen time over the season's frozen terrain and
// carried here so the client can draw the authoritative path rather than
// re-deriving it from its own procedural terrainAt(), which drifts from a
// season's frozen terrain whenever the bundled worldgen algorithm changes.
export const normalizeProtoDock = (dock: ProtoDockRoute): PlayerSubscriptionDock | undefined => {
  const dockId = dock.dock_id || dock.dockId;
  const tileKey = dock.tile_key || dock.tileKey;
  const pairedDockId = dock.paired_dock_id || dock.pairedDockId;
  if (!dockId || !tileKey || !pairedDockId) return undefined;
  const connectedDockIds = dock.connected_dock_ids || dock.connectedDockIds;
  // Only routes with at least two waypoints are usable as a polyline; anything
  // shorter is dropped so the client falls back rather than drawing a
  // degenerate line.
  const routeWaypointsByLinkedDockId: Record<string, Array<{ x: number; y: number }>> = {};
  for (const route of dock.routes ?? []) {
    const linkedDockId = route.linked_dock_id || route.linkedDockId;
    if (!linkedDockId) continue;
    const waypoints = (route.waypoints ?? [])
      .filter((waypoint): waypoint is { x: number; y: number } => typeof waypoint.x === "number" && typeof waypoint.y === "number")
      .map((waypoint) => ({ x: waypoint.x, y: waypoint.y }));
    if (waypoints.length >= 2) routeWaypointsByLinkedDockId[linkedDockId] = waypoints;
  }
  const hasRoutes = Object.keys(routeWaypointsByLinkedDockId).length > 0;
  return {
    dockId,
    tileKey,
    pairedDockId,
    ...(connectedDockIds?.length ? { connectedDockIds: [...connectedDockIds] } : {}),
    ...(hasRoutes ? { routeWaypointsByLinkedDockId } : {})
  };
};
