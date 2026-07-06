import { isSeaTerrain } from "@border-empires/shared";

import type {
  ServerWorldgenIslandConnectivityDeps,
  ServerWorldgenIslandConnectivityRuntime
} from "./server-world-runtime-types.js";

const FOUR_DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const;
const EIGHT_DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1]
] as const;

export const createServerWorldgenIslandConnectivity = (
  deps: ServerWorldgenIslandConnectivityDeps
): ServerWorldgenIslandConnectivityRuntime => {
  const { WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY, terrainAt, overrideTerrainAt } = deps;
  const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;

  // Land masses fully ringed by mountain never border sea, so dock
  // generation (which only places docks on sea-adjacent land) can never
  // reach them. This carves a channel out to the nearest sea for every
  // such land mass so it always has at least one sea-adjacent tile.
  const ensureLandMassesReachSea = (): void => {
    const total = WORLD_WIDTH * WORLD_HEIGHT;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const startIdx = worldIndex(x, y);
        if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;

        let head = 0;
        let tail = 0;
        visited[startIdx] = 1;
        queue[tail++] = startIdx;
        const componentTiles: number[] = [];
        let touchesSea = false;

        while (head < tail) {
          const idx = queue[head++]!;
          componentTiles.push(idx);
          const cx = idx % WORLD_WIDTH;
          const cy = Math.floor(idx / WORLD_WIDTH);
          for (const [dx, dy] of FOUR_DIRECTIONS) {
            const nx = wrapX(cx + dx, WORLD_WIDTH);
            const ny = wrapY(cy + dy, WORLD_HEIGHT);
            if (isSeaTerrain(terrainAt(nx, ny))) touchesSea = true;
          }
          for (const [dx, dy] of EIGHT_DIRECTIONS) {
            const nx = wrapX(cx + dx, WORLD_WIDTH);
            const ny = wrapY(cy + dy, WORLD_HEIGHT);
            const nIdx = worldIndex(nx, ny);
            if (visited[nIdx] || terrainAt(nx, ny) !== "LAND") continue;
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }

        if (touchesSea) continue;

        // Multi-source BFS from every non-sea tile bordering this land
        // mass, travelling through mountain or (if a mountain-only route
        // doesn't reach open water, e.g. a mountain-locked pocket buried
        // inside a larger landmass) other land, until the nearest sea
        // tile is reached. The discovered path becomes the new channel;
        // this can carve through a neighboring land mass's tiles, but
        // only at world-generation time, before any clusters, towns, or
        // player territory exist there.
        const corridorVisited = new Set<number>(componentTiles);
        const parent = new Map<number, number>();
        let corridorHead = 0;
        const corridorQueue: number[] = [];
        for (const landIdx of componentTiles) {
          const lx = landIdx % WORLD_WIDTH;
          const ly = Math.floor(landIdx / WORLD_WIDTH);
          for (const [dx, dy] of FOUR_DIRECTIONS) {
            const nx = wrapX(lx + dx, WORLD_WIDTH);
            const ny = wrapY(ly + dy, WORLD_HEIGHT);
            const nIdx = worldIndex(nx, ny);
            if (corridorVisited.has(nIdx) || isSeaTerrain(terrainAt(nx, ny))) continue;
            corridorVisited.add(nIdx);
            corridorQueue.push(nIdx);
          }
        }

        let seaIdx: number | undefined;
        while (corridorHead < corridorQueue.length && seaIdx === undefined) {
          const idx = corridorQueue[corridorHead++]!;
          const cx = idx % WORLD_WIDTH;
          const cy = Math.floor(idx / WORLD_WIDTH);
          for (const [dx, dy] of FOUR_DIRECTIONS) {
            const nx = wrapX(cx + dx, WORLD_WIDTH);
            const ny = wrapY(cy + dy, WORLD_HEIGHT);
            const nIdx = worldIndex(nx, ny);
            if (isSeaTerrain(terrainAt(nx, ny))) {
              seaIdx = idx;
              break;
            }
            if (corridorVisited.has(nIdx)) continue;
            corridorVisited.add(nIdx);
            parent.set(nIdx, idx);
            corridorQueue.push(nIdx);
          }
        }

        // No path to sea exists at all (the whole world is landlocked);
        // nothing safe to carve, so leave it as-is.
        if (seaIdx === undefined) continue;

        let cursor: number | undefined = seaIdx;
        while (cursor !== undefined) {
          const cx = cursor % WORLD_WIDTH;
          const cy = Math.floor(cursor / WORLD_WIDTH);
          overrideTerrainAt(cx, cy, "SEA");
          cursor = parent.get(cursor);
        }
      }
    }
  };

  return { ensureLandMassesReachSea };
};
