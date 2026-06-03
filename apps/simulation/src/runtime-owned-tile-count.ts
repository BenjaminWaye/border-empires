import type { DomainTileState } from "@border-empires/game-domain";

export const ownedTileCountForPlayer = (tiles: ReadonlyMap<string, DomainTileState>, playerId: string): number => {
  let count = 0;
  for (const tile of tiles.values()) {
    if (tile.ownerId === playerId) count += 1;
  }
  return count;
};
