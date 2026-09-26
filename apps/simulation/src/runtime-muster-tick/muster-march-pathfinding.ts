import type { DomainTileState } from "@border-empires/game-domain";
import { coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
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
 */
export const buildTerrainDistanceField = (
  rootX: number,
  rootY: number,
  getTile: (x: number, y: number) => DomainTileState | undefined,
  maxSteps: number
): Map<string, number> => {
  const dist = new Map<string, number>();
  const rootKey = simulationTileKey(rootX, rootY);
  dist.set(rootKey, 0);
  const queue: Array<{ x: number; y: number }> = [{ x: rootX, y: rootY }];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentDist = dist.get(simulationTileKey(current.x, current.y))!;
    if (currentDist >= maxSteps) continue;

    for (const { x, y } of coordsInChebyshevRadius(current.x, current.y, 1)) {
      const tile = getTile(x, y);
      if (!tile || tile.terrain !== "LAND") continue;
      const key = simulationTileKey(x, y);
      if (dist.has(key)) continue;
      dist.set(key, currentDist + 1);
      queue.push({ x, y });
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
