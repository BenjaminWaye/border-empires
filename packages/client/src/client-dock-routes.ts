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
  const manhattanLinear = (fromX: number, fromY: number, toX: number, toY: number): number => Math.abs(fromX - toX) + Math.abs(fromY - toY);
  const nearestSeaNeighbor = (x: number, y: number, tx: number, ty: number): { x: number; y: number } | undefined => {
    const candidates = [
      { x: deps.wrapX(x), y: deps.wrapY(y - 1) },
      { x: deps.wrapX(x + 1), y: deps.wrapY(y) },
      { x: deps.wrapX(x), y: deps.wrapY(y + 1) },
      { x: deps.wrapX(x - 1), y: deps.wrapY(y) }
    ].filter((point) => terrainAt(point.x, point.y) === "SEA");
    if (candidates.length === 0) return undefined;
    candidates.sort((left, right) => manhattanLinear(left.x, left.y, tx, ty) - manhattanLinear(right.x, right.y, tx, ty));
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
  const open: number[] = [start];
  const inOpen = new Set<number>([start]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  const fScore = new Map<number, number>([[start, manhattanLinear(aSea.x, aSea.y, bSea.x, bSea.y)]]);
  const maxExpanded = 24_000;
  let expanded = 0;
  let solved = false;

  while (open.length > 0 && expanded < maxExpanded) {
    let bestIndex = 0;
    let bestScore = fScore.get(open[0]!) ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < open.length; i += 1) {
      const score = fScore.get(open[i]!) ?? Number.POSITIVE_INFINITY;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0]!;
    inOpen.delete(current);
    expanded += 1;
    if (current === goal) {
      solved = true;
      break;
    }
    const cx = current % WORLD_WIDTH;
    const cy = Math.floor(current / WORLD_WIDTH);
    const neighbors = [
      { x: cx, y: cy - 1 },
      { x: cx + 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx - 1, y: cy }
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= WORLD_WIDTH || neighbor.y >= WORLD_HEIGHT) continue;
      if (terrainAt(neighbor.x, neighbor.y) !== "SEA") continue;
      const neighborIndex = deps.worldIndex(neighbor.x, neighbor.y);
      const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentative >= (gScore.get(neighborIndex) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborIndex, current);
      gScore.set(neighborIndex, tentative);
      fScore.set(neighborIndex, tentative + manhattanLinear(neighbor.x, neighbor.y, bSea.x, bSea.y));
      if (!inOpen.has(neighborIndex)) {
        inOpen.add(neighborIndex);
        open.push(neighborIndex);
      }
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
