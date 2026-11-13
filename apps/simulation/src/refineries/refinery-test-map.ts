// Test-only domain-tile map for refinery tests: one character per tile,
// origin (20, 20). Same legend as packages/shared/src/refineries/refinery-test-fixtures.ts:
//   .  p1 SETTLED land   f  p1 FRONTIER land   _  unowned land   ~  sea
//   e  p2 SETTLED land   T  p1 TOWN-tier town  t  p1 SETTLED titanium
//   r  p1 FRONTIER titanium   x  unowned titanium   E  p2 SETTLED titanium
import type { DomainTileState } from "@border-empires/game-domain";

export const ORIGIN = 20;
export const P1 = "p1";
export const P2 = "p2";

export const refineryTestMap = (rows: readonly string[]): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  rows.forEach((row, dy) => [...row].forEach((char, dx) => {
    const x = ORIGIN + dx;
    const y = ORIGIN + dy;
    const tile: DomainTileState = { x, y, terrain: char === "~" ? "SEA" : "LAND" };
    if (".Tte".includes(char) || char === "E") tile.ownershipState = "SETTLED";
    if ("fr".includes(char)) tile.ownershipState = "FRONTIER";
    if (".fTtr".includes(char)) tile.ownerId = P1;
    if ("eE".includes(char)) tile.ownerId = P2;
    if ("trxE".includes(char)) tile.resource = "TITANIUM";
    if (char === "T") tile.town = { type: "MARKET", populationTier: "TOWN" };
    tiles.set(`${x},${y}`, tile);
  }));
  return tiles;
};

export const keyAt = (column: number, row: number): string => `${ORIGIN + column},${ORIGIN + row}`;

export const place = (
  tiles: Map<string, DomainTileState>, column: number, row: number,
  structure: Omit<NonNullable<DomainTileState["economicStructure"]>, "ownerId"> & { ownerId?: string }
): DomainTileState => {
  const key = keyAt(column, row);
  const next = { ...tiles.get(key)!, economicStructure: { ownerId: P1, ...structure } } as DomainTileState;
  tiles.set(key, next);
  return next;
};

export const fieldAt = (column: number, row: number, assignedAt = 1) => ({ x: ORIGIN + column, y: ORIGIN + row, assignedAt });
