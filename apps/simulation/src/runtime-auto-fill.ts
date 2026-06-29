import { AUTO_FILL_ENABLED, AUTO_FILL_MAX_REGION_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export const findEnclosedRegion = (
  originKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  enclosingOwnerId: string
): Set<string> | null => {
  const origin = tiles.get(originKey);
  if (!origin || origin.ownerId || origin.terrain !== "LAND") return null;

  const region = new Set<string>();
  // FIFO queue backed by an array + head index — avoids the O(n) cost of
  // Array.prototype.shift() on every dequeue (BFS visits up to ~500 tiles).
  const queue: Array<[number, number]> = [[origin.x, origin.y]];
  let head = 0;
  region.add(originKey);

  while (head < queue.length) {
    const [x, y] = queue[head]!;
    head += 1;
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) return null;
      const key = simulationTileKey(nx, ny);
      if (region.has(key)) continue;
      const neighbor = tiles.get(key);
      // Natural barriers (sea, coastal sea, mountain) and the enclosing player's
      // own tiles wall the region in. A missing tile is treated as a solid wall —
      // the world map is dense, so an absent in-bounds key cannot leak the region.
      if (!neighbor || neighbor.terrain !== "LAND" || neighbor.ownerId === enclosingOwnerId) continue;
      // Any other owner means the pocket is not enclosed by *your* territory: it
      // leans on an enemy wall, so it is left for manual play rather than claimed.
      if (neighbor.ownerId) return null;
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
  for (const [dx, dy] of DIRECTIONS) {
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

/**
 * Auto-fill: settle all unowned land pockets fully enclosed by `ownerId`'s
 * territory adjacent to `capturedTile`. Returns the newly-settled tiles.
 * Returns an empty array immediately when AUTO_FILL_ENABLED is false.
 */
export const applyAutoFill = (input: {
  capturedTile: DomainTileState;
  ownerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (key: string, tile: DomainTileState) => void;
  onAutoFillTiles?: ((count: number) => void) | undefined;
}): DomainTileState[] => {
  if (!AUTO_FILL_ENABLED) return [];
  const { capturedTile, ownerId, tiles, replaceTileState, onAutoFillTiles } = input;
  const regions = findEnclosedRegionsAdjacentTo(capturedTile, tiles, ownerId);
  const settled: DomainTileState[] = [];
  for (const region of regions) {
    for (const key of region) {
      const existing = tiles.get(key);
      if (!existing || existing.ownerId) continue;
      const filledTile: DomainTileState = {
        ...existing,
        ownerId,
        ownershipState: "SETTLED",
        frontierDecayAt: undefined,
        frontierDecayKind: undefined,
      };
      replaceTileState(key, filledTile);
      settled.push(filledTile);
    }
  }
  if (settled.length > 0) onAutoFillTiles?.(settled.length);
  return settled;
};
