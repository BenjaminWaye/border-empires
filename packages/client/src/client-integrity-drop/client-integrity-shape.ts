// Where an empire's shape costs it Integrity, on the client's tile map: holes
// (land you don't own, walled in by yours) and thin lines (your land open on
// two opposite sides). Uses the same open-side rule as the weak-tile overlay
// (exposedSidesForTile: a side facing land you don't own is open; water and
// mountains block), so the drop notice, the Integrity panel and the 2D/3D
// highlights all point at the same tiles.

import type { Tile } from "../client-types.js";
import { exposedSidesForTile, isOwnedLandTile, type ExposedSidesArgs } from "../client-defensibility-tile.js";

const SIDES = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 }
] as const;

const isBlockingTerrain = (terrain: Tile["terrain"]): boolean => terrain === "SEA" || terrain === "COASTAL_SEA" || terrain === "MOUNTAIN";

/**
 * A hole: land at (x, y) that isn't yours, with 3+ of its 4 sides facing your land, or 2+ with the rest water or
 * mountain. Taking it closes those open sides at once. Cheap owner lookups run first; worldgen terrain only after.
 */
export const isIntegrityHoleAt = (x: number, y: number, args: ExposedSidesArgs): boolean => {
  const tile = args.tiles.get(args.keyFor(args.wrapX(x), args.wrapY(y)));
  if (isOwnedLandTile(tile, args.me)) return false;
  let mine = 0;
  for (const side of SIDES) {
    if (isOwnedLandTile(args.tiles.get(args.keyFor(args.wrapX(x + side.dx), args.wrapY(y + side.dy))), args.me)) mine += 1;
  }
  if (mine < 2) return false;
  if (args.terrainAt(x, y) !== "LAND") return false;
  if (mine >= 3) return true;
  return SIDES.every((side) => {
    const nx = x + side.dx;
    const ny = y + side.dy;
    return isOwnedLandTile(args.tiles.get(args.keyFor(args.wrapX(nx), args.wrapY(ny))), args.me) || isBlockingTerrain(args.terrainAt(nx, ny));
  });
};

/** One of your tiles open on two opposite sides (north and south, or east and west): a line one tile thick. */
export const isThinLineTile = (tile: Tile, args: ExposedSidesArgs): boolean => {
  const open = exposedSidesForTile(tile, args);
  return (open.includes("north") && open.includes("south")) || (open.includes("east") && open.includes("west"));
};

export type IntegrityShapeSpot = { readonly x: number; readonly y: number; readonly key: string; readonly coastal: boolean };

export type IntegrityShapeScan = {
  readonly holes: readonly IntegrityShapeSpot[];
  readonly thinLines: readonly IntegrityShapeSpot[];
  /** Centre of your land, for "in the east" style directions. */
  readonly centre: { readonly x: number; readonly y: number } | undefined;
};

const touchesSea = (x: number, y: number, args: ExposedSidesArgs): boolean =>
  SIDES.some((side) => {
    const terrain = args.terrainAt(x + side.dx, y + side.dy);
    return terrain === "SEA" || terrain === "COASTAL_SEA";
  });

/** Holes and thin lines across all your land, each in (y, x) order so the result is stable. */
export const scanIntegrityShape = (args: ExposedSidesArgs): IntegrityShapeScan => {
  const holes = new Map<string, IntegrityShapeSpot>();
  const thinLines: IntegrityShapeSpot[] = [];
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const tile of args.tiles.values()) {
    if (!isOwnedLandTile(tile, args.me)) continue;
    sumX += tile.x;
    sumY += tile.y;
    count += 1;
    if (isThinLineTile(tile, args)) thinLines.push({ x: tile.x, y: tile.y, key: args.keyFor(tile.x, tile.y), coastal: touchesSea(tile.x, tile.y, args) });
    for (const side of SIDES) {
      const nx = args.wrapX(tile.x + side.dx);
      const ny = args.wrapY(tile.y + side.dy);
      const key = args.keyFor(nx, ny);
      if (holes.has(key) || !isIntegrityHoleAt(nx, ny, args)) continue;
      holes.set(key, { x: nx, y: ny, key, coastal: touchesSea(nx, ny, args) });
    }
  }
  const byPosition = (a: IntegrityShapeSpot, b: IntegrityShapeSpot): number => a.y - b.y || a.x - b.x;
  return {
    holes: [...holes.values()].sort(byPosition),
    thinLines: thinLines.sort(byPosition),
    centre: count > 0 ? { x: sumX / count, y: sumY / count } : undefined
  };
};

/** "east", "north"... of `centre`, or "middle" when close to it. Map y grows southward. */
export const compassFrom = (centre: { x: number; y: number } | undefined, x: number, y: number): string => {
  if (!centre) return "middle";
  const dx = x - centre.x;
  const dy = y - centre.y;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return "middle";
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
};
