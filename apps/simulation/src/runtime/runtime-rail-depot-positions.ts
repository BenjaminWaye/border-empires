import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Positions of one player's active Rail Depots, for the muster tick.
 * §5.4: skips dormant Rail Depots -- an unpowered depot can't grant the
 * muster boost.
 *
 * Per player, not per world: the muster tick runs every second for watched
 * flags and for every human ADVANCE/MARCH flag, and only ever needs the owner
 * of the flag it is ticking. Resolving every owner's depots on each tick (as
 * this used to) made that cost grow with the whole server's depot count.
 *
 * Extracted out of runtime.ts (already over the repo's 500-line file cap --
 * see AGENTS.md's file-line-limit rule) so this helper doesn't grow that
 * file further.
 */
export const railDepotPositionsForPlayer = (
  index: ReadonlyMap<string, Set<string>>,
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  isStructureDormant: (playerId: string, tileKey: string, field: "economicStructure") => boolean
): Array<{ x: number; y: number }> => {
  const keys = index.get(playerId);
  if (!keys) return [];
  const positions: Array<{ x: number; y: number }> = [];
  for (const key of keys) {
    if (isStructureDormant(playerId, key, "economicStructure")) continue;
    const tile = tiles.get(key);
    if (tile) positions.push({ x: tile.x, y: tile.y });
  }
  return positions;
};
