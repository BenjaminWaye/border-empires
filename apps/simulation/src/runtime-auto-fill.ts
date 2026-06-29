import { AUTO_FILL_MAX_REGION_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";

export const findEnclosedRegion = (
  originKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  enclosingOwnerId: string
): Set<string> | null => {
  const origin = tiles.get(originKey);
  if (!origin || origin.ownerId || origin.terrain !== "LAND") return null;

  const region = new Set<string>();
  const queue: Array<[number, number]> = [[origin.x, origin.y]];
  region.add(originKey);

  while (queue.length > 0) {
    const entry = queue.shift()!;
    const [x, y] = entry;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) return null;
      const key = simulationTileKey(nx, ny);
      if (region.has(key)) continue;
      const neighbor = tiles.get(key);
      if (
        !neighbor ||
        neighbor.terrain === "SEA" ||
        neighbor.terrain === "COASTAL_SEA" ||
        neighbor.terrain === "MOUNTAIN" ||
        neighbor.ownerId === enclosingOwnerId
      ) continue;
      if (neighbor.ownerId) continue;
      region.add(key);
      if (region.size > AUTO_FILL_MAX_REGION_SIZE) return null;
      queue.push([nx, ny]);
    }
  }
  return region;
};

export const findEnclosedRegionsAdjacentTo = (
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  ownerId: string
): Array<Set<string>> => {
  const checkedOrigins = new Set<string>();
  const results: Array<Set<string>> = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nx = tile.x + dx;
    const ny = tile.y + dy;
    if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) continue;
    const key = simulationTileKey(nx, ny);
    if (checkedOrigins.has(key)) continue;
    const region = findEnclosedRegion(key, tiles, ownerId);
    if (region) {
      for (const k of region) checkedOrigins.add(k);
      results.push(region);
    } else {
      checkedOrigins.add(key);
    }
  }
  return results;
};
