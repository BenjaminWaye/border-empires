// Client-side check behind the one-time landmass naming prompt
// (client-landmass-name-prompt.ts): which landmasses does the player wholly
// garrison, and what are their ids? Mirrors the simulation's island registry
// (apps/simulation/src/island-names/island-registry.ts): 8-connected non-sea
// tiles (LAND or MOUNTAIN), wrapping at the world edges, id = the landmass's
// first tile in row-major order, and only LAND tiles need garrisoning.
// Terrain comes from the known tile when there is one, else from the seeded
// worldgen the client already runs.
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

/**
 * Every landmass the player wholly garrisons, found from their own garrisoned
 * tiles in one pass: each landmass is walked at most once (a walk that fails
 * marks everything it touched, and a later walk reaching those tiles stops at
 * once, since they are connected to the same unheld land). Returns the ids
 * (first tile in row-major order) of the fully held ones.
 */
export const fullyHeldIslandIds = (
  ownGarrisons: Iterable<{ readonly x: number; readonly y: number }>,
  deps: IslandHoldDeps
): string[] => {
  const width = deps.width ?? WORLD_WIDTH;
  const height = deps.height ?? WORLD_HEIGHT;
  const terrainOf = (cx: number, cy: number): Terrain => deps.tileAt(cx, cy)?.terrain ?? deps.terrainAt(cx, cy);
  const settled = new Set<number>();
  const failed = new Set<number>();
  const held: string[] = [];
  for (const start of ownGarrisons) {
    const startCell = wrap(start.y, height) * width + wrap(start.x, width);
    if (settled.has(startCell) || failed.has(startCell)) continue;
    const seen = new Set<number>([startCell]);
    const queue = [{ x: wrap(start.x, width), y: wrap(start.y, height) }];
    let ok = true;
    let landTiles = 0;
    let anchorCell = startCell;
    for (let index = 0; index < queue.length && ok; index += 1) {
      const current = queue[index]!;
      if (terrainOf(current.x, current.y) === "LAND") {
        const tile = deps.tileAt(current.x, current.y);
        if (tile?.ownerId !== deps.me || tile.ownershipState !== "SETTLED") ok = false;
        landTiles += 1;
      }
      anchorCell = Math.min(anchorCell, current.y * width + current.x);
      for (let dy = -1; dy <= 1 && ok; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = wrap(current.x + dx, width);
          const ny = wrap(current.y + dy, height);
          const cell = ny * width + nx;
          if (seen.has(cell) || isSeaTerrain(terrainOf(nx, ny))) continue;
          if (failed.has(cell)) {
            ok = false;
            break;
          }
          seen.add(cell);
          queue.push({ x: nx, y: ny });
        }
      }
      if (queue.length > (deps.maxTiles ?? 60_000)) ok = false;
    }
    for (const cell of seen) (ok ? settled : failed).add(cell);
    if (ok && landTiles >= ISLAND_NAME_MIN_LAND_TILES) held.push(`${anchorCell % width},${Math.floor(anchorCell / width)}`);
  }
  return held;
};
