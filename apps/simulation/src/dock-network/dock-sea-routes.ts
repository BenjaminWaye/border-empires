import { isSeaTerrain, type Terrain, type TileKey } from "@border-empires/shared";

import type { DockRouteDefinition } from "./dock-network.js";

// Server-authoritative sea route geometry. The dashed dock-to-dock line shown
// to players is only a rendering detail, but it used to be computed entirely
// client-side by running A* over the *client's* procedural terrainAt(), which
// drifts from the frozen worldgen_baselines terrain the server actually plays
// on. When the two disagreed about where sea was, the client's A* returned an
// empty path and no route was drawn. These helpers compute the same path here,
// at worldgen time, from the authoritative terrain, so the route is frozen
// with the world instead of re-derived from drifting client code.

export type RouteWaypoint = { x: number; y: number };

export type SeaRouteTerrainReader = {
  terrainAt: (x: number, y: number) => Terrain;
  worldIndex: (x: number, y: number) => number;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  worldWidth: number;
  worldHeight: number;
};

export type WorldgenDockExport = DockRouteDefinition & { tileKey: TileKey };

const isSeaLike = (terrain: Terrain): boolean => isSeaTerrain(terrain);

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};

const linkedDockIdsFor = (dock: Pick<DockRouteDefinition, "connectedDockIds" | "pairedDockId">): readonly string[] =>
  dock.connectedDockIds?.length ? dock.connectedDockIds : dock.pairedDockId ? [dock.pairedDockId] : [];

export const snapToSeaNeighbor = (
  x: number,
  y: number,
  toX: number,
  toY: number,
  reader: SeaRouteTerrainReader
): RouteWaypoint | undefined => {
  const manhattanToroid = (fromX: number, fromY: number, toXX: number, toYY: number): number => {
    const dx = Math.abs(fromX - toXX);
    const dy = Math.abs(fromY - toYY);
    return Math.min(dx, reader.worldWidth - dx) + Math.min(dy, reader.worldHeight - dy);
  };
  // If the dock tile itself sits on sea terrain, use it directly.
  if (isSeaLike(reader.terrainAt(x, y))) return { x: reader.wrapX(x), y: reader.wrapY(y) };
  const candidates = [
    { x: reader.wrapX(x), y: reader.wrapY(y - 1) },
    { x: reader.wrapX(x + 1), y: reader.wrapY(y) },
    { x: reader.wrapX(x), y: reader.wrapY(y + 1) },
    { x: reader.wrapX(x - 1), y: reader.wrapY(y) }
  ].filter((point) => isSeaLike(reader.terrainAt(point.x, point.y)));
  if (candidates.length > 0) {
    candidates.sort((left, right) => manhattanToroid(left.x, left.y, toX, toY) - manhattanToroid(right.x, right.y, toX, toY));
    return candidates[0];
  }
  // Fall back to a wider 2-tile-radius scan for docks set inland from the coast.
  const radius2: RouteWaypoint[] = [];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
      const wx = reader.wrapX(x + dx);
      const wy = reader.wrapY(y + dy);
      if (isSeaLike(reader.terrainAt(wx, wy))) radius2.push({ x: wx, y: wy });
    }
  }
  if (radius2.length === 0) return undefined;
  radius2.sort((left, right) => manhattanToroid(left.x, left.y, toX, toY) - manhattanToroid(right.x, right.y, toX, toY));
  return radius2[0];
};

const reconstructSeaPath = (cameFrom: Map<number, number>, endIdx: number, reader: SeaRouteTerrainReader): RouteWaypoint[] => {
  const out: RouteWaypoint[] = [];
  let current = endIdx;
  while (true) {
    out.push({ x: current % reader.worldWidth, y: Math.floor(current / reader.worldWidth) });
    const prev = cameFrom.get(current);
    if (prev === undefined) break;
    current = prev;
  }
  return out.reverse();
};

// Mirrors the client's old A* so an existing route continues to land on the
// same sea tiles the client would have drawn, now sourced from authoritative
// terrain. Returns an empty array when no sea path exists.
export const computeSeaRouteWaypoints = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  reader: SeaRouteTerrainReader
): RouteWaypoint[] => {
  const manhattanToroid = (fromX: number, fromY: number, toX: number, toY: number): number => {
    const dx = Math.abs(fromX - toX);
    const dy = Math.abs(fromY - toY);
    return Math.min(dx, reader.worldWidth - dx) + Math.min(dy, reader.worldHeight - dy);
  };
  const aSea = snapToSeaNeighbor(ax, ay, bx, by, reader);
  const bSea = snapToSeaNeighbor(bx, by, ax, ay, reader);
  if (!aSea || !bSea) return [];

  const start = reader.worldIndex(aSea.x, aSea.y);
  const goal = reader.worldIndex(bSea.x, bSea.y);
  const heapScore: number[] = [];
  const heapNode: number[] = [];
  const heapPush = (score: number, node: number): void => {
    heapScore.push(score);
    heapNode.push(node);
    let i = heapScore.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapScore[parent]! <= heapScore[i]!) break;
      [heapScore[parent], heapScore[i]] = [heapScore[i]!, heapScore[parent]!];
      [heapNode[parent], heapNode[i]] = [heapNode[i]!, heapNode[parent]!];
      i = parent;
    }
  };
  const heapPop = (): { score: number; node: number } | undefined => {
    if (heapScore.length === 0) return undefined;
    const score = heapScore[0]!;
    const node = heapNode[0]!;
    const tailScore = heapScore.pop()!;
    const tailNode = heapNode.pop()!;
    if (heapScore.length > 0) {
      heapScore[0] = tailScore;
      heapNode[0] = tailNode;
      const n = heapScore.length;
      let i = 0;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && heapScore[left]! < heapScore[smallest]!) smallest = left;
        if (right < n && heapScore[right]! < heapScore[smallest]!) smallest = right;
        if (smallest === i) break;
        [heapScore[smallest], heapScore[i]] = [heapScore[i]!, heapScore[smallest]!];
        [heapNode[smallest], heapNode[i]] = [heapNode[i]!, heapNode[smallest]!];
        i = smallest;
      }
    }
    return { score, node };
  };

  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  heapPush(manhattanToroid(aSea.x, aSea.y, bSea.x, bSea.y), start);
  const maxExpanded = 200_000;
  let expanded = 0;
  let solved = false;

  while (heapScore.length > 0 && expanded < maxExpanded) {
    const popped = heapPop()!;
    const current = popped.node;
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;
    const cx = current % reader.worldWidth;
    const cy = Math.floor(current / reader.worldWidth);
    if (popped.score > currentG + manhattanToroid(cx, cy, bSea.x, bSea.y)) continue;
    if (current === goal) {
      solved = true;
      break;
    }
    expanded += 1;
    const neighbors = [
      { x: reader.wrapX(cx), y: reader.wrapY(cy - 1) },
      { x: reader.wrapX(cx + 1), y: reader.wrapY(cy) },
      { x: reader.wrapX(cx), y: reader.wrapY(cy + 1) },
      { x: reader.wrapX(cx - 1), y: reader.wrapY(cy) }
    ];
    for (const neighbor of neighbors) {
      if (!isSeaLike(reader.terrainAt(neighbor.x, neighbor.y))) continue;
      const neighborIndex = reader.worldIndex(neighbor.x, neighbor.y);
      const tentative = currentG + 1;
      if (tentative >= (gScore.get(neighborIndex) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborIndex, current);
      gScore.set(neighborIndex, tentative);
      heapPush(tentative + manhattanToroid(neighbor.x, neighbor.y, bSea.x, bSea.y), neighborIndex);
    }
  }

  return solved ? reconstructSeaPath(cameFrom, goal, reader) : [];
};

// Computes and stores, on each dock, the sea-route waypoints to every dock it
// is connected to. The routes are keyed by the linked dock's id so the gateway
// can attach the right path to each dock pair it exports. Runs once at worldgen
// time over the authoritative terrain, freezing geometry with the world.
export const attachDockSeaRoutes = (
  dockById: ReadonlyMap<string, DockRouteDefinition>,
  reader: SeaRouteTerrainReader
): void => {
  for (const dock of dockById.values()) {
    const dockCoords = parseTileKey(dock.tileKey);
    if (!dockCoords) continue;
    const linkedIds = linkedDockIdsFor(dock);
    for (const linkedId of linkedIds) {
      const linked = dockById.get(linkedId);
      if (!linked) continue;
      const linkedCoords = parseTileKey(linked.tileKey);
      if (!linkedCoords) continue;
      const route = computeSeaRouteWaypoints(dockCoords.x, dockCoords.y, linkedCoords.x, linkedCoords.y, reader);
      if (route.length < 2) continue;
      dock.routeWaypointsByLinkedDockId = {
        ...(dock.routeWaypointsByLinkedDockId ?? {}),
        [linkedId]: route
      };
    }
  }
};

export const exportDocksFromWorldgen = (dockById: ReadonlyMap<string, WorldgenDockExport>): WorldgenDockExport[] =>
  [...dockById.values()].map((dock) => ({
    dockId: dock.dockId,
    tileKey: dock.tileKey,
    pairedDockId: dock.pairedDockId,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}),
    ...(dock.routeWaypointsByLinkedDockId ? { routeWaypointsByLinkedDockId: dock.routeWaypointsByLinkedDockId } : {})
  }));

export const finalizeSeasonWorldDocks = (
  dockById: ReadonlyMap<string, WorldgenDockExport>,
  reader: SeaRouteTerrainReader
): WorldgenDockExport[] => {
  attachDockSeaRoutes(dockById, reader);
  return exportDocksFromWorldgen(dockById);
};
