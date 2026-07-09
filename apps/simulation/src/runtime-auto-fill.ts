import { AUTO_FILL_ENABLED, AUTO_FILL_MAX_REGION_SIZE, AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
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
  // Whether any part of the seal is a natural barrier (sea/mountain) rather than
  // the player's own settled territory. Natural-barrier-sealed pockets are held
  // to a much smaller size cap (see the size check below).
  let usedNaturalBarrier = false;

  while (head < queue.length) {
    const [x, y] = queue[head]!;
    head += 1;
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      // The map edge is a leak, not a seal — a region reaching it isn't walled
      // by terrain or our territory.
      if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) return null;
      const key = simulationTileKey(nx, ny);
      if (region.has(key)) continue;
      const neighbor = tiles.get(key);
      // The enclosing player's own SETTLED tiles are a permanent seal.
      if (neighbor && neighbor.ownerId === enclosingOwnerId && neighbor.ownershipState === "SETTLED") continue;
      // Enemy tiles (any state) aren't ours to claim — leak out.
      if (neighbor && neighbor.ownerId && neighbor.ownerId !== enclosingOwnerId) return null;
      // Our own FRONTIER and unowned LAND are transparent interior — traversed
      // and (for unowned tiles) claimed. FRONTIER is walked through but never
      // seals, since it can still decay back to unowned.
      if (neighbor && neighbor.terrain === "LAND") {
        region.add(key);
        if (region.size > AUTO_FILL_MAX_REGION_SIZE) return null;
        queue.push([nx, ny]);
        continue;
      }
      // Anything else — sea, coastal sea, mountain, or a missing tile — is a
      // natural barrier that seals the pocket but caps its size.
      usedNaturalBarrier = true;
    }
  }
  // A pocket that leans on natural barriers is only auto-claimed when small; a
  // pocket fully ringed by the player's own settled tiles may be much larger.
  if (usedNaturalBarrier && region.size > AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE) return null;
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
 * Auto-fill: settle all unowned land pockets sealed by `ownerId`'s territory
 * adjacent to `capturedTile`. Natural barriers (sea, mountain) count toward the
 * seal, but a pocket that leans on them is capped at
 * AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE; a pocket walled purely by the
 * player's own SETTLED tiles may grow to AUTO_FILL_MAX_REGION_SIZE. Pockets
 * bordering enemy territory are left alone. Returns the newly-settled tiles.
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
