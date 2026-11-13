// Test-only planner-tile map for the AI refinery tests: one character per
// tile, origin (20, 20). Legend:
//   .  ai-1 SETTLED land     f  ai-1 FRONTIER land     _  unowned land   ~  sea
//   T  ai-1 TOWN-tier town   t  ai-1 SETTLED titanium  r  ai-1 FRONTIER titanium
//   u  ai-1 SETTLED umbrite  x  unowned titanium
import type { StructurePlannerTile } from "../structure-command-planner.js";

export const AI = "ai-1";
export const ORIGIN = 20;

export const plannerRefineryMap = (rows: readonly string[]): Map<string, StructurePlannerTile> => {
  const tiles = new Map<string, StructurePlannerTile>();
  rows.forEach((row, dy) => [...row].forEach((char, dx) => {
    const tile: StructurePlannerTile = { x: ORIGIN + dx, y: ORIGIN + dy, terrain: char === "~" ? "SEA" : "LAND" };
    if (".Ttu".includes(char)) tile.ownershipState = "SETTLED";
    if ("fr".includes(char)) tile.ownershipState = "FRONTIER";
    if (".fTtru".includes(char)) tile.ownerId = AI;
    if ("trx".includes(char)) tile.resource = "TITANIUM";
    if (char === "u") tile.resource = "UMBRITE";
    if (char === "T") tile.town = { populationTier: "TOWN" };
    tiles.set(`${tile.x},${tile.y}`, tile);
  }));
  return tiles;
};

export const at = (column: number, row: number): { x: number; y: number } => ({ x: ORIGIN + column, y: ORIGIN + row });

/** Puts an economic structure (owned by the AI unless given) on the tile at (column, row). */
export const placeStructure = (
  tiles: Map<string, StructurePlannerTile>, column: number, row: number,
  structure: NonNullable<StructurePlannerTile["economicStructure"]>
): void => {
  const key = `${ORIGIN + column},${ORIGIN + row}`;
  tiles.set(key, { ...tiles.get(key)!, economicStructure: { ownerId: AI, status: "active", ...structure } });
};
