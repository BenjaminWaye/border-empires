// "Show on map" for a Three Metropolises (Three Seats) charge: the explored
// part of the named landmass, and the explored towns on it (any of them
// counts). The landmass is walked on the client: the charge's target key is
// `metropolis:<islandId>`, and an island id is its first tile in row-major
// order, so walking 8-connected non-sea tiles from it (wrapping at the world
// edges) yields the same landmass as the simulation's island registry
// (apps/simulation/src/island-names/island-registry.ts, mirrored by
// client-map-name-labels/client-island-hold.ts). Terrain comes from the known
// tile when there is one, else from the seeded worldgen the client already
// runs. Only explored tiles (in state.tiles) are ever returned.
import { WORLD_HEIGHT, WORLD_WIDTH, isSeaTerrain, terrainAt, type HouseChargeView, type Terrain } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type LandmassState = Pick<ClientState, "tiles"> & Partial<Pick<ClientState, "tilesRevision">>;
export type LandmassPoint = { x: number; y: number };
export type MetropolisHighlight = { readonly area: readonly LandmassPoint[]; readonly towns: readonly LandmassPoint[] };

/** Safety cap on the walk; a continent is tens of thousands of tiles. */
const MAX_WALK_TILES = 80_000;
const EMPTY: MetropolisHighlight = { area: [], towns: [] };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const metropolisIslandId = (charge: Pick<HouseChargeView, "kind" | "targets">): string | undefined => {
  if (charge.kind !== "METROPOLIS") return undefined;
  const key = charge.targets[0]?.key;
  if (!key?.startsWith("metropolis:")) return undefined;
  const id = key.slice("metropolis:".length);
  return /^\d+,\d+$/.test(id) ? id : undefined;
};

/** Every tile key ("x,y") of the landmass whose id is `islandId`. */
export const walkLandmass = (
  islandId: string,
  terrainOf: (x: number, y: number) => Terrain,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): Set<string> => {
  const [startX, startY] = islandId.split(",").map(Number) as [number, number];
  const keys = new Set<string>();
  if (isSeaTerrain(terrainOf(startX, startY))) return keys;
  keys.add(`${startX},${startY}`);
  const queue: Array<[number, number]> = [[startX, startY]];
  for (let index = 0; index < queue.length && keys.size < MAX_WALK_TILES; index += 1) {
    const [x, y] = queue[index]!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrap(x + dx, width);
        const ny = wrap(y + dy, height);
        const key = `${nx},${ny}`;
        if (keys.has(key) || isSeaTerrain(terrainOf(nx, ny))) continue;
        keys.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return keys;
};

// One landmass at a time (the focused charge). Terrain never changes within a
// season, so the walk is kept until another landmass is focused.
let walkCache: { islandId: string; keys: Set<string> } | undefined;
// The explored part is recomputed when tiles change: a new revision or tile count.
let highlightCache: { islandId: string; revision: number; tileCount: number; highlight: MetropolisHighlight } | undefined;

const landmassKeys = (islandId: string, state: LandmassState): Set<string> => {
  if (walkCache?.islandId !== islandId) {
    walkCache = { islandId, keys: walkLandmass(islandId, (x, y) => state.tiles.get(`${x},${y}`)?.terrain ?? terrainAt(x, y)) };
  }
  return walkCache.keys;
};

/** The explored tiles and explored towns of a Three Metropolises charge's landmass; empty for any other charge. */
export const metropolisHighlight = (charge: Pick<HouseChargeView, "kind" | "targets">, state: LandmassState): MetropolisHighlight => {
  const islandId = metropolisIslandId(charge);
  if (!islandId) return EMPTY;
  const revision = state.tilesRevision ?? -1;
  if (highlightCache && highlightCache.islandId === islandId && highlightCache.revision === revision && highlightCache.tileCount === state.tiles.size && revision >= 0) {
    return highlightCache.highlight;
  }
  const keys = landmassKeys(islandId, state);
  const area: LandmassPoint[] = [];
  const towns: LandmassPoint[] = [];
  const consider = (key: string): void => {
    const tile = state.tiles.get(key);
    if (!tile || isSeaTerrain(tile.terrain) || !keys.has(key)) return;
    area.push({ x: tile.x, y: tile.y });
    if (tile.town) towns.push({ x: tile.x, y: tile.y });
  };
  // Walk whichever is smaller: the landmass, or what the player has explored.
  if (keys.size <= state.tiles.size) for (const key of keys) consider(key);
  else for (const key of state.tiles.keys()) consider(key);
  const highlight = { area, towns };
  highlightCache = { islandId, revision, tileCount: state.tiles.size, highlight };
  return highlight;
};

/** Test hook: forget the cached walk and highlight. */
export const resetMetropolisHighlightCache = (): void => {
  walkCache = undefined;
  highlightCache = undefined;
};
