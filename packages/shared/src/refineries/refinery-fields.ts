// Deposit fields and refinery links (docs/territory-development-plan.md,
// Phase 2). A field is derived from tiles, never stored: the 8-connected
// component of same-resource deposit tiles containing a tile. A field is
// linked to a town when a breadth-first search from the town tile, stepping
// 8-way only through LAND the refinery owner holds (FRONTIER or SETTLED),
// reaches any field tile within REFINERY_REACH_LAND_TILES steps.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { REFINERY_REACH_LAND_TILES } from "./refinery-constants.js";
import type { RefineryFieldResource, RefineryTile } from "./refinery-types.js";

export const refineryTileKey = (x: number, y: number): string => `${x},${y}`;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]
];

/** Wrap-aware 8-neighbour keys of (x, y). */
export const refineryNeighborKeys = (x: number, y: number): string[] =>
  NEIGHBOR_OFFSETS.map(([dx, dy]) => refineryTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));

/** Smaller tile first: by x, then y (the repo's usual deterministic tie-break). */
export const compareRefineryTiles = (a: { x: number; y: number }, b: { x: number; y: number }): number => a.x - b.x || a.y - b.y;

export type RefineryField = {
  resource: RefineryFieldResource;
  /** Every tile of the component, in ascending tile order. */
  tiles: RefineryTile[];
  keys: ReadonlySet<string>;
  /** The component's smallest tile: a stable identity for "same field". */
  id: string;
};

/** The field (8-connected same-resource component) containing (x, y); undefined when that tile is not such a deposit. */
export const refineryFieldAt = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, x: number, y: number, resource: RefineryFieldResource
): RefineryField | undefined => {
  const start = tiles.get(refineryTileKey(x, y));
  if (!start || start.resource !== resource) return undefined;
  const keys = new Set<string>([refineryTileKey(start.x, start.y)]);
  const found: RefineryTile[] = [start];
  for (let index = 0; index < found.length; index += 1) {
    const tile = found[index]!;
    for (const key of refineryNeighborKeys(tile.x, tile.y)) {
      if (keys.has(key)) continue;
      const neighbor = tiles.get(key);
      if (neighbor?.resource !== resource) continue;
      keys.add(key);
      found.push(neighbor);
    }
  }
  found.sort(compareRefineryTiles);
  const first = found[0]!;
  return { resource, tiles: found, keys, id: refineryTileKey(first.x, first.y) };
};

const passableForOwner = (tile: RefineryTile | undefined, ownerId: string): tile is RefineryTile =>
  Boolean(tile && tile.terrain === "LAND" && tile.ownerId === ownerId &&
    (tile.ownershipState === "FRONTIER" || tile.ownershipState === "SETTLED"));

/**
 * Land-step distance from the town tile to every tile of the owner's land
 * within reach (the town itself is 0). Water, mountains, unowned and other
 * players' tiles block.
 */
export const refineryReachFromTown = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, townX: number, townY: number, reach = REFINERY_REACH_LAND_TILES
): Map<string, number> => {
  const distances = new Map<string, number>();
  const town = tiles.get(refineryTileKey(townX, townY));
  if (!passableForOwner(town, ownerId)) return distances;
  const queue: RefineryTile[] = [town];
  distances.set(refineryTileKey(town.x, town.y), 0);
  for (let index = 0; index < queue.length; index += 1) {
    const tile = queue[index]!;
    const distance = distances.get(refineryTileKey(tile.x, tile.y))!;
    if (distance >= reach) continue;
    for (const key of refineryNeighborKeys(tile.x, tile.y)) {
      if (distances.has(key)) continue;
      const neighbor = tiles.get(key);
      if (!passableForOwner(neighbor, ownerId)) continue;
      distances.set(key, distance + 1);
      queue.push(neighbor);
    }
  }
  return distances;
};

/** True when the owner's land joins the town to any tile of the field within reach. */
export const refineryFieldLinked = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, townKey: string, field: RefineryField,
  reachFromTown: ReadonlyMap<string, number> = refineryReachFromTownKey(tiles, ownerId, townKey)
): boolean => {
  for (const key of field.keys) if (reachFromTown.has(key)) return true;
  return false;
};

export const refineryReachFromTownKey = <T extends RefineryTile>(
  tiles: ReadonlyMap<string, T>, ownerId: string, townKey: string
): Map<string, number> => {
  const town = tiles.get(townKey);
  return town ? refineryReachFromTown(tiles, ownerId, town.x, town.y) : new Map();
};
