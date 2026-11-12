// Test-only map builder for the refinery rules: one character per tile.
//   .  owned SETTLED land     f  owned FRONTIER land     _  unowned land
//   ~  sea                    ^  mountain                e  enemy SETTLED land
//   T  owned TOWN-tier town   t  owned SETTLED titanium  r  owned FRONTIER titanium
//   x  unowned titanium       E  enemy SETTLED titanium  g  owned SETTLED gems
//   m  owned SETTLED umbrite
import type { RefineryStructureRecord, RefineryTile } from "./refinery-types.js";

export const OWNER = "p1";
export const ENEMY = "p2";
export const ORIGIN = 10;

export const buildRefineryGrid = (rows: readonly string[]): Map<string, RefineryTile> => {
  const tiles = new Map<string, RefineryTile>();
  rows.forEach((row, dy) => {
    [...row].forEach((char, dx) => {
      const x = ORIGIN + dx;
      const y = ORIGIN + dy;
      const tile: RefineryTile = { x, y, terrain: char === "~" ? "SEA" : char === "^" ? "MOUNTAIN" : "LAND" };
      if (".TtgmE".includes(char) || char === "e") tile.ownershipState = "SETTLED";
      if ("fr".includes(char)) tile.ownershipState = "FRONTIER";
      if (".fTtrgm".includes(char)) tile.ownerId = OWNER;
      if ("eE".includes(char)) tile.ownerId = ENEMY;
      if ("trxE".includes(char)) tile.resource = "TITANIUM";
      if (char === "g") tile.resource = "GEMS";
      if (char === "m") tile.resource = "UMBRITE";
      if (char === "T") tile.town = { populationTier: "TOWN" };
      tiles.set(`${x},${y}`, tile);
    });
  });
  return tiles;
};

/** Grid coordinates (column, row) to world tile coordinates. */
export const at = (column: number, row: number): { x: number; y: number } => ({ x: ORIGIN + column, y: ORIGIN + row });

export const placeStructure = (
  tiles: Map<string, RefineryTile>, column: number, row: number, record: Omit<RefineryStructureRecord, "ownerId"> & { ownerId?: string }
): RefineryTile => {
  const { x, y } = at(column, row);
  const tile = tiles.get(`${x},${y}`)!;
  tile.economicStructure = { ownerId: OWNER, ...record };
  return tile;
};

/** Every owned SETTLED tile within one tile (Chebyshev) of the town at (column, row) belongs to it. */
export const ringResolver = (townColumn: number, townRow: number) => (ownerId: string, x: number, y: number): string | undefined => {
  const town = at(townColumn, townRow);
  return ownerId === OWNER && Math.max(Math.abs(x - town.x), Math.abs(y - town.y)) <= 1 && (x !== town.x || y !== town.y)
    ? `${town.x},${town.y}` : undefined;
};
