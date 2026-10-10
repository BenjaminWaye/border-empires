import { WORLD_HEIGHT, WORLD_WIDTH, tileKey, wrapX, wrapY } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export type OnboardingRoute = { target: Tile; steps: number; next: Tile | undefined };

/** Known land only; enemy territory and unknown fog cannot promise a safe route. */
export const onboardingRoutes = (tiles: ReadonlyMap<string, Tile>, playerId: string): Map<string, OnboardingRoute> => {
  const routes = new Map<string, OnboardingRoute>();
  const queue: OnboardingRoute[] = [];
  // This runs during HUD updates: cap work independently of mature empire size.
  const maxVisited = 4096;
  for (const tile of tiles.values()) {
    if (tile.ownerId !== playerId || tile.terrain !== "LAND" || tile.optimisticPending === "expand" || queue.length >= 1024) continue;
    const route = { target: tile, steps: 0, next: undefined };
    queue.push(route);
    routes.set(tileKey(tile.x, tile.y), route);
  }
  for (let index = 0; index < queue.length && routes.size < maxVisited; index += 1) {
    const current = queue[index]!;
    if (current.steps >= 16) continue;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (routes.size >= maxVisited) break;
      const key = tileKey(wrapX(current.target.x + dx, WORLD_WIDTH), wrapY(current.target.y + dy, WORLD_HEIGHT));
      if (routes.has(key)) continue;
      const target = tiles.get(key);
      if (!target || target.terrain !== "LAND" || (target.ownerId && target.ownerId !== playerId) || (target.reachOwnerId && target.reachOwnerId !== playerId)) continue;
      const route = { target, steps: current.steps + 1, next: current.next ?? target };
      routes.set(key, route);
      queue.push(route);
    }
  }
  return routes;
};
