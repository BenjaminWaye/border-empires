import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Convert a rail depot key index to position arrays for the muster tick.
 * §5.4: skips dormant Rail Depots — an unpowered depot can't grant the
 * muster boost.
 *
 * Extracted out of runtime.ts (already over the repo's 500-line file cap —
 * see AGENTS.md's file-line-limit rule) so adding rival-reach-push's Runtime
 * accessors doesn't grow that file further.
 */
export const railDepotPositionsFromKeys = (
  index: ReadonlyMap<string, Set<string>>,
  tiles: ReadonlyMap<string, DomainTileState>,
  isStructureDormant: (playerId: string, tileKey: string, field: "economicStructure") => boolean
): Map<string, Array<{ x: number; y: number }>> => {
  const result = new Map<string, Array<{ x: number; y: number }>>();
  for (const [ownerId, keys] of index) {
    const positions: Array<{ x: number; y: number }> = [];
    for (const key of keys) {
      if (isStructureDormant(ownerId, key, "economicStructure")) continue;
      const tile = tiles.get(key);
      if (tile) positions.push({ x: tile.x, y: tile.y });
    }
    if (positions.length > 0) result.set(ownerId, positions);
  }
  return result;
};
