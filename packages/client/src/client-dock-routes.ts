import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt } from "@border-empires/shared";
import type { DockPair, Tile } from "./client-types.js";

export const computeDockSeaRoute = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  deps: {
    dockRouteCache: Map<string, Array<{ x: number; y: number }>>;
    worldIndex: (x: number, y: number) => number;
    wrapX: (x: number) => number;
    wrapY: (y: number) => number;
  }
): Array<{ x: number; y: number }> => {
  const dockRouteKey = (fromX: number, fromY: number, toX: number, toY: number): string => `${fromX},${fromY}->${toX},${toY}`;
  const manhattanToroid = (fromX: number, fromY: number, toX: number, toY: number): number => {
    const dx = Math.abs(fromX - toX);
    const dy = Math.abs(fromY - toY);
    return Math.min(dx, WORLD_WIDTH - dx) + Math.min(dy, WORLD_HEIGHT - dy);
  };
  const nearestSeaNeighbor = (x: number, y: number, tx: number, ty: number): { x: number; y: number } | undefined => {
    const candidates = [
      { x: deps.wrapX(x), y: deps.wrapY(y - 1) },
      { x: deps.wrapX(x + 1), y: deps.wrapY(y) },
      { x: deps.wrapX(x), y: deps.wrapY(y + 1) },
      { x: deps.wrapX(x - 1), y: deps.wrapY(y) }
    ].filter((point) => { const terrain = terrainAt(point.x, point.y); return terrain === "SEA" || terrain === "COASTAL_SEA"; });
    if (candidates.length === 0) return undefined;
    candidates.sort((left, right) => manhattanToroid(left.x, left.y, tx, ty) - manhattanToroid(right.x, right.y, tx, ty));
    return candidates[0];
  };
  const reconstructSeaPath = (cameFrom: Map<number, number>, endIdx: number): Array<{ x: number; y: number }> => {
    const out: Array<{ x: number; y: number }> = [];
    let current = endIdx;
    while (true) {
      out.push({ x: current % WORLD_WIDTH, y: Math.floor(current / WORLD_WIDTH) });
      const prev = cameFrom.get(current);
      if (prev === undefined) break;
      current = prev;
    }
    out.reverse();
    return out;
  };

  const cacheKey = dockRouteKey(ax, ay, bx, by);
  const cached = deps.dockRouteCache.get(cacheKey);
  if (cached) return cached;
  const aSea = nearestSeaNeighbor(ax, ay, bx, by);
  const bSea = nearestSeaNeighbor(bx, by, ax, ay);
  if (!aSea || !bSea) {
    deps.dockRouteCache.set(cacheKey, []);
    return [];
  }

  const start = deps.worldIndex(aSea.x, aSea.y);
  const goal = deps.worldIndex(bSea.x, bSea.y);
  // Binary min-heap keyed on f-score, with parallel node-index array.
  // Stale entries (superseded by a better path to the same node) are
  // detected on pop by comparing the popped score against the recorded
  // gScore + heuristic.
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
  const maxExpanded = 24_000;
  let expanded = 0;
  let solved = false;

  while (heapScore.length > 0 && expanded < maxExpanded) {
    const popped = heapPop()!;
    const current = popped.node;
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;
    const cx = current % WORLD_WIDTH;
    const cy = Math.floor(current / WORLD_WIDTH);
    if (popped.score > currentG + manhattanToroid(cx, cy, bSea.x, bSea.y)) continue;
    if (current === goal) {
      solved = true;
      break;
    }
    expanded += 1;
    const neighbors = [
      { x: deps.wrapX(cx), y: deps.wrapY(cy - 1) },
      { x: deps.wrapX(cx + 1), y: deps.wrapY(cy) },
      { x: deps.wrapX(cx), y: deps.wrapY(cy + 1) },
      { x: deps.wrapX(cx - 1), y: deps.wrapY(cy) }
    ];
    for (const neighbor of neighbors) {
      const terrain = terrainAt(neighbor.x, neighbor.y);
      if (terrain !== "SEA" && terrain !== "COASTAL_SEA") continue;
      const neighborIndex = deps.worldIndex(neighbor.x, neighbor.y);
      const tentative = currentG + 1;
      if (tentative >= (gScore.get(neighborIndex) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborIndex, current);
      gScore.set(neighborIndex, tentative);
      heapPush(tentative + manhattanToroid(neighbor.x, neighbor.y, bSea.x, bSea.y), neighborIndex);
    }
  }

  const route = solved ? reconstructSeaPath(cameFrom, goal) : [];
  deps.dockRouteCache.set(cacheKey, route);
  return route;
};

export const markDockDiscovered = (
  tile: Tile,
  deps: { discoveredDockTiles: Set<string>; keyFor: (x: number, y: number) => string }
): void => {
  if (tile.dockId && !tile.fogged) deps.discoveredDockTiles.add(deps.keyFor(tile.x, tile.y));
};

export const isDockRouteVisibleForPlayer = (
  pair: DockPair,
  deps: {
    fogDisabled: boolean;
    selected: { x: number; y: number } | undefined;
    discoveredDockTiles: Set<string>;
    keyFor: (x: number, y: number) => string;
  }
): boolean => {
  if (deps.fogDisabled) return true;
  if (
    deps.selected &&
    ((deps.selected.x === pair.ax && deps.selected.y === pair.ay) || (deps.selected.x === pair.bx && deps.selected.y === pair.by))
  ) {
    return true;
  }
  return deps.discoveredDockTiles.has(deps.keyFor(pair.ax, pair.ay)) && deps.discoveredDockTiles.has(deps.keyFor(pair.bx, pair.by));
};

export const buildMiniMapBase = (deps: {
  miniMapBase: HTMLCanvasElement;
  miniMapBaseCtx: CanvasRenderingContext2D;
  cachedTerrainColorAt: (x: number, y: number, terrain: Tile["terrain"]) => string;
}): void => {
  const w = deps.miniMapBase.width;
  const h = deps.miniMapBase.height;
  deps.miniMapBaseCtx.clearRect(0, 0, w, h);
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const wx = Math.floor((px / w) * WORLD_WIDTH);
      const wy = Math.floor((py / h) * WORLD_HEIGHT);
      const terrain = terrainAt(wx, wy);
      deps.miniMapBaseCtx.fillStyle = deps.cachedTerrainColorAt(wx, wy, terrain);
      deps.miniMapBaseCtx.fillRect(px, py, 1, 1);
    }
  }
};
