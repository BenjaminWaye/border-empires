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
  // The interior we flood is our own FRONTIER or unowned LAND. A SETTLED tile is
  // a wall (not a region member); natural barriers and enemy tiles are leaks.
  if (!origin || origin.terrain !== "LAND") return null;
  if (origin.ownerId && !(origin.ownerId === enclosingOwnerId && origin.ownershipState === "FRONTIER")) return null;

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
      // The map edge is a leak, not a seal — a region reaching it isn't walled
      // by our territory.
      if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) return null;
      const key = simulationTileKey(nx, ny);
      if (region.has(key)) continue;
      const neighbor = tiles.get(key);
      // Only the enclosing player's own SETTLED tiles seal the region.
      if (neighbor && neighbor.ownerId === enclosingOwnerId && neighbor.ownershipState === "SETTLED") continue;
      // Everything else that isn't our own frontier or unowned land is a leak:
      //   - natural barriers (sea, coastal sea, mountain) and missing tiles no
      //     longer wall the region — a pocket touching the coast or a peak is
      //     "open", so we require the player to seal it with their own settled
      //     territory before it is claimed;
      //   - enemy tiles (any state) aren't ours to claim.
      // Our own FRONTIER is transparent interior — traversed but not claimed,
      // since it can still decay back to unowned and isn't permanent territory.
      if (!neighbor || neighbor.terrain !== "LAND") return null;
      if (neighbor.ownerId && neighbor.ownerId !== enclosingOwnerId) return null;
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
 * Auto-fill: settle all unowned land pockets fully sealed by `ownerId`'s own
 * SETTLED tiles adjacent to `capturedTile`. Natural barriers (sea, mountain) do
 * NOT seal a pocket — a region touching the coast, a peak, the map edge, or
 * enemy territory is left alone; the player must ring it with their own settled
 * territory to claim it. Returns the newly-settled tiles.
 * Returns an empty array immediately when AUTO_FILL_ENABLED is false.
 *
 * `recordYieldAnchors` is invoked once with every newly-settled tile key so the
 * caller can stamp their yield-collection baseline in a single batch, matching
 * the manual settle path (otherwise an auto-filled tile would accrue yield from
 * the player's income anchor rather than from the moment it was settled). It is
 * batched deliberately — per-tile anchor events are a known event-loop hazard
 * (see the TILE_YIELD_ANCHOR_BATCH rationale in runtime.ts).
 */
export const applyAutoFill = (input: {
  capturedTile: DomainTileState;
  ownerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (key: string, tile: DomainTileState) => void;
  onAutoFillTiles?: ((count: number) => void) | undefined;
  recordYieldAnchors?: ((keys: readonly string[]) => void) | undefined;
}): DomainTileState[] => {
  if (!AUTO_FILL_ENABLED) return [];
  const { capturedTile, ownerId, tiles, replaceTileState, onAutoFillTiles, recordYieldAnchors } = input;
  const regions = findEnclosedRegionsAdjacentTo(capturedTile, tiles, ownerId);
  const settled: DomainTileState[] = [];
  const settledKeys: string[] = [];
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
      settledKeys.push(key);
      settled.push(filledTile);
    }
  }
  if (settled.length > 0) {
    onAutoFillTiles?.(settled.length);
    recordYieldAnchors?.(settledKeys);
  }
  return settled;
};
