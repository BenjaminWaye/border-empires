import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { Terrain } from "@border-empires/shared";

/** A tile map from rows of characters: "L" LAND, "M" MOUNTAIN, anything else sea. Unlisted cells are sea. */
export const tilesFromRows = (rows: readonly string[], originX = 0, originY = 0): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  rows.forEach((row, dy) => {
    [...row].forEach((cell, dx) => {
      const terrain: Terrain = cell === "L" ? "LAND" : cell === "M" ? "MOUNTAIN" : "SEA";
      const x = originX + dx;
      const y = originY + dy;
      tiles.set(`${x},${y}`, { x, y, terrain });
    });
  });
  return tiles;
};

/** Garrisons every LAND tile in `tiles` whose key passes `include` for `ownerId`. */
export const garrison = (tiles: Map<string, DomainTileState>, ownerId: string, include: (tile: DomainTileState) => boolean = () => true): void => {
  for (const [key, tile] of tiles) {
    if (tile.terrain !== "LAND" || !include(tile)) continue;
    tiles.set(key, { ...tile, ownerId, ownershipState: "SETTLED" });
  }
};

export const makePlayer = (id: string, overrides: Partial<DomainPlayer> = {}): DomainPlayer => ({
  id,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set(),
  allies: new Set(),
  ...overrides
});
