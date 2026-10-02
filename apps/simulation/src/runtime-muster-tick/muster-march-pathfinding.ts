import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";

/**
 * Generalizes the BFS-frontier-expansion pathfinding pattern used to build
 * the client's road network (see client-road-network.ts's
 * connectedComponentForOwner/findShortestPathToNetwork) into a terrain-only
 * "distance field": a breadth-first flood out from a single root tile across
 * every passable (LAND) tile on the map, regardless of who owns it,
 * recording the true tile-step distance to each one.
 *
 * Unlike a straight-line (Chebyshev) estimate, this actually walks the grid,
 * so it routes around water/impassable terrain instead of assuming a clear
 * line exists between two points. It's rooted at the MARCH target rather
 * than at each candidate, so a single BFS per tick gives an O(1)
 * distance-to-target lookup for every candidate the muster search
 * considers, instead of paying for a fresh search per candidate.
 *
 * Bounded by maxSteps -- callers must size the cap to the search they
 * actually need (e.g. flag-to-target distance plus the local candidate
 * radius) so a distant or unreachable target can't turn this into an
 * unbounded flood over the whole map. Tiles beyond the cap, or that the
 * flood never reaches (cut off by water, map edge, etc.), simply have no
 * entry -- callers fall back to a straight-line estimate for those.
 *
 * `stopAtKey` ends the flood early: once that tile has been reached, only the
 * rest of the level before it is expanded, so every tile *closer* to the root
 * than `stopAtKey` is in the field (which is all MARCH needs -- it never moves
 * to a tile that is no closer to the target than the flag). A tile missing
 * from an early-stopped field is therefore known to be at least as far as
 * `stopAtKey`, never "unknown". Muster ticks run this every second per
 * flag, and for a short march this cuts the flooded area by an order of
 * magnitude. If `stopAtKey` is never reached the flood runs to the cap, as
 * without it.
 *
 * The inner loop avoids the per-neighbor coordinate arrays and key strings
 * the shared radius helper allocates: a numeric visited set filters repeat
 * visits first, so each tile builds its string key at most once.
 */
export const buildTerrainDistanceField = (
  rootX: number,
  rootY: number,
  getTile: (x: number, y: number) => DomainTileState | undefined,
  maxSteps: number,
  stopAtKey?: string
): Map<string, number> => {
  const dist = new Map<string, number>();
  const rootKey = simulationTileKey(rootX, rootY);
  dist.set(rootKey, 0);
  if (rootKey === stopAtKey) return dist;
  const visited = new Set<number>([rootY * WORLD_WIDTH + rootX]);
  const queueX: number[] = [rootX];
  const queueY: number[] = [rootY];
  const queueDist: number[] = [0];
  let stopDist = maxSteps;
  for (let head = 0; head < queueX.length; head += 1) {
    const currentDist = queueDist[head]!;
    if (currentDist >= stopDist) break;
    const cx = queueX[head]!;
    const cy = queueY[head]!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = wrapX(cx + dx, WORLD_WIDTH);
        const y = wrapY(cy + dy, WORLD_HEIGHT);
        const numericKey = y * WORLD_WIDTH + x;
        if (visited.has(numericKey)) continue;
        visited.add(numericKey);
        const tile = getTile(x, y);
        if (!tile || tile.terrain !== "LAND") continue;
        const key = simulationTileKey(x, y);
        dist.set(key, currentDist + 1);
        queueX.push(x);
        queueY.push(y);
        queueDist.push(currentDist + 1);
        if (key === stopAtKey) stopDist = Math.min(stopDist, currentDist + 1);
      }
    }
  }
  return dist;
};

// Signed shortest delta from a to b on a wrapping axis of the given size.
const wrappedDelta = (a: number, b: number, size: number): number => {
  const raw = (((b - a) % size) + size) % size;
  return raw > size / 2 ? raw - size : raw;
};

/**
 * Perpendicular distance from (px, py) to the straight line running from the
 * flag (fx, fy) through the march target (tx, ty), honouring the world wrap.
 * MARCH uses it as a tiebreak so, among equally short routes, it follows the
 * one a player would draw with a ruler from flag to target.
 */
export const deviationFromMarchLine = (
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  px: number,
  py: number,
  worldWidth: number,
  worldHeight: number
): number => {
  const vx = wrappedDelta(fx, tx, worldWidth);
  const vy = wrappedDelta(fy, ty, worldHeight);
  const cx = wrappedDelta(fx, px, worldWidth);
  const cy = wrappedDelta(fy, py, worldHeight);
  const length = Math.hypot(vx, vy);
  if (length === 0) return Math.hypot(cx, cy);
  return Math.abs(cx * vy - cy * vx) / length;
};
