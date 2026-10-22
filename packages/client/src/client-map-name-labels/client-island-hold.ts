// Client-side check behind the tile menu's "Name Island" action: is the
// island under `tile` fully garrisoned by me, and what is its id? Mirrors the
// simulation's island registry (apps/simulation/src/island-names/
// island-registry.ts): 8-connected non-sea tiles (LAND or MOUNTAIN), wrapping
// at the world edges, id = the island's first tile in row-major order, and
// only LAND tiles need garrisoning. Terrain comes from the known tile when
// there is one, else from the seeded worldgen the client already runs.
//
// Cheap in the common case: the walk stops at the first LAND tile that isn't
// my garrison, so it only covers a whole island when I really do hold it all.
import { ISLAND_NAME_MIN_LAND_TILES, WORLD_HEIGHT, WORLD_WIDTH, isSeaTerrain, type Terrain } from "@border-empires/shared";

export type IslandHoldTile = { readonly terrain: Terrain; readonly ownerId?: string | undefined; readonly ownershipState?: string | undefined };

export type IslandHoldDeps = {
  readonly me: string;
  readonly tileAt: (x: number, y: number) => IslandHoldTile | undefined;
  readonly terrainAt: (x: number, y: number) => Terrain;
  readonly width?: number;
  readonly height?: number;
  /** Safety cap on the walk (a continent-sized landmass the player somehow holds). */
  readonly maxTiles?: number;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/** The fully held island's id, or undefined when `(x, y)` isn't on an island I wholly garrison. */
export const fullyHeldIslandIdAt = (x: number, y: number, deps: IslandHoldDeps): string | undefined => {
  const width = deps.width ?? WORLD_WIDTH;
  const height = deps.height ?? WORLD_HEIGHT;
  const maxTiles = deps.maxTiles ?? 60_000;
  const terrainOf = (cx: number, cy: number): Terrain => deps.tileAt(cx, cy)?.terrain ?? deps.terrainAt(cx, cy);
  const start = { x: wrap(x, width), y: wrap(y, height) };
  if (isSeaTerrain(terrainOf(start.x, start.y))) return undefined;
  const seen = new Set<number>([start.y * width + start.x]);
  const queue = [start];
  let landTiles = 0;
  let anchorCell = start.y * width + start.x;
  for (let index = 0; index < queue.length; index += 1) {
    if (queue.length > maxTiles) return undefined;
    const current = queue[index]!;
    if (terrainOf(current.x, current.y) === "LAND") {
      const tile = deps.tileAt(current.x, current.y);
      if (tile?.ownerId !== deps.me || tile.ownershipState !== "SETTLED") return undefined;
      landTiles += 1;
    }
    anchorCell = Math.min(anchorCell, current.y * width + current.x);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrap(current.x + dx, width);
        const ny = wrap(current.y + dy, height);
        const cell = ny * width + nx;
        if (seen.has(cell) || isSeaTerrain(terrainOf(nx, ny))) continue;
        seen.add(cell);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  if (landTiles < ISLAND_NAME_MIN_LAND_TILES) return undefined;
  return `${anchorCell % width},${Math.floor(anchorCell / width)}`;
};
