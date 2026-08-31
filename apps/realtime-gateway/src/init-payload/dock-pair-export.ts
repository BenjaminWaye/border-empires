export type DockPairRouteView = Array<{ x: number; y: number }>;

export type DockPairView = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  route?: DockPairRouteView;
};

type DockLike = {
  dockId: string;
  tileKey: string;
  pairedDockId?: string;
  connectedDockIds?: readonly string[];
  routeWaypointsByLinkedDockId?: Readonly<Record<string, ReadonlyArray<{ x: number; y: number }>>>;
};

// Builds the dock-pair edge list the client draws sea routes for. The route
// waypoints are server-computed (frozen with the world at worldgen time) and
// attached per linked dock id, so the client renders the authoritative path
// instead of re-deriving sea terrain from its own drifting procedural code.
export const exportDockPairs = (docks: ReadonlyArray<DockLike>): DockPairView[] => {
  const dockById = new Map(docks.map((dock) => [dock.dockId, dock] as const));
  const seen = new Set<string>();
  const pairs: DockPairView[] = [];
  for (const dock of docks) {
    const links =
      dock.connectedDockIds && dock.connectedDockIds.length > 0
        ? dock.connectedDockIds
        : dock.pairedDockId
          ? [dock.pairedDockId]
          : [];
    for (const linkedDockId of links) {
      const linked = dockById.get(linkedDockId);
      if (!linked) continue;
      const edgeKey = dock.dockId < linked.dockId ? `${dock.dockId}|${linked.dockId}` : `${linked.dockId}|${dock.dockId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const [axRaw, ayRaw] = dock.tileKey.split(",");
      const [bxRaw, byRaw] = linked.tileKey.split(",");
      const ax = Number(axRaw);
      const ay = Number(ayRaw);
      const bx = Number(bxRaw);
      const by = Number(byRaw);
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      const route = dock.routeWaypointsByLinkedDockId?.[linkedDockId];
      pairs.push(route && route.length >= 2 ? { ax, ay, bx, by, route: [...route] } : { ax, ay, bx, by });
    }
  }
  return pairs;
};
