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
import { WORLD_HEIGHT, WORLD_WIDTH, getWorldSeed, isSeaTerrain, terrainAt, type HouseChargeView, type Terrain } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

type LandmassState = Pick<ClientState, "tiles">;
export type LandmassPoint = { x: number; y: number };
export type MetropolisHighlight = { readonly area: readonly LandmassPoint[]; readonly towns: readonly LandmassPoint[] };
type MetropolisCharge = Pick<HouseChargeView, "kind" | "targets">;

/** Safety cap on the walk; a continent is tens of thousands of tiles. */
const MAX_WALK_TILES = 80_000;
/** Recompute the explored part at least this often even when no tile was added (a town founded on a known tile). */
const HIGHLIGHT_REFRESH_MS = 5_000;
const EMPTY: MetropolisHighlight = { area: [], towns: [] };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const metropolisIslandId = (charge: MetropolisCharge): string | undefined => {
  if (charge.kind !== "METROPOLIS") return undefined;
  const key = charge.targets[0]?.key;
  if (!key?.startsWith("metropolis:")) return undefined;
  const id = key.slice("metropolis:".length);
  return /^\d+,\d+$/.test(id) ? id : undefined;
};

/** Every cell (y * width + x) of the landmass whose id is `islandId`. */
export const walkLandmass = (
  islandId: string,
  terrainOf: (x: number, y: number) => Terrain,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): number[] => {
  const [startX, startY] = islandId.split(",").map(Number) as [number, number];
  if (isSeaTerrain(terrainOf(startX, startY))) return [];
  const visited = new Uint8Array(width * height);
  const start = startY * width + startX;
  visited[start] = 1;
  const cells = [start];
  for (let index = 0; index < cells.length && cells.length < MAX_WALK_TILES; index += 1) {
    const cell = cells[index]!;
    const x = cell % width;
    const y = Math.floor(cell / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrap(x + dx, width);
        const ny = wrap(y + dy, height);
        const next = ny * width + nx;
        if (visited[next] || isSeaTerrain(terrainOf(nx, ny))) continue;
        visited[next] = 1;
        cells.push(next);
      }
    }
  }
  return cells;
};

// Terrain never changes within a season, so walks are kept per world seed and landmass (a handful of charges at most).
const walkCache = new Map<string, readonly number[]>();
let highlightCache: { cacheKey: string; tileCount: number; builtAt: number; highlight: MetropolisHighlight } | undefined;

const landmassCells = (cacheKey: string, islandId: string, state: LandmassState): readonly number[] => {
  let cells = walkCache.get(cacheKey);
  if (!cells) {
    cells = walkLandmass(islandId, (x, y) => state.tiles.get(`${x},${y}`)?.terrain ?? terrainAt(x, y));
    if (walkCache.size >= 8) walkCache.clear();
    walkCache.set(cacheKey, cells);
  }
  return cells;
};

const wrappedDistanceSq = (a: LandmassPoint, b: LandmassPoint): number => {
  const dx = Math.min(wrap(a.x - b.x, WORLD_WIDTH), wrap(b.x - a.x, WORLD_WIDTH));
  const dy = Math.min(wrap(a.y - b.y, WORLD_HEIGHT), wrap(b.y - a.y, WORLD_HEIGHT));
  return dx * dx + dy * dy;
};

/**
 * The explored tiles and explored towns of a Three Metropolises charge's landmass, nearest the charge's
 * target point first (so a capped draw keeps the part around the towns the House was pointed at); empty for
 * any other charge. Explored land only grows, so the list is rebuilt when a tile is added, or every few seconds.
 */
export const metropolisHighlight = (charge: MetropolisCharge, state: LandmassState, nowMs = Date.now()): MetropolisHighlight => {
  const islandId = metropolisIslandId(charge);
  const target = charge.targets[0];
  if (!islandId || !target) return EMPTY;
  const cacheKey = `${getWorldSeed()}:${islandId}`;
  const cached = highlightCache;
  if (cached && cached.cacheKey === cacheKey && cached.tileCount === state.tiles.size && nowMs - cached.builtAt < HIGHLIGHT_REFRESH_MS) {
    return cached.highlight;
  }
  const cells = landmassCells(cacheKey, islandId, state);
  const area: LandmassPoint[] = [];
  const towns: LandmassPoint[] = [];
  for (const cell of cells) {
    const tile = state.tiles.get(`${cell % WORLD_WIDTH},${Math.floor(cell / WORLD_WIDTH)}`);
    if (!tile || isSeaTerrain(tile.terrain)) continue;
    area.push({ x: tile.x, y: tile.y });
    if (tile.town) towns.push({ x: tile.x, y: tile.y });
  }
  const byDistance = (a: LandmassPoint, b: LandmassPoint): number => wrappedDistanceSq(a, target) - wrappedDistanceSq(b, target);
  area.sort(byDistance);
  towns.sort(byDistance);
  const highlight = { area, towns };
  highlightCache = { cacheKey, tileCount: state.tiles.size, builtAt: nowMs, highlight };
  return highlight;
};

/** Test hook: forget the cached walks and highlight. */
export const resetMetropolisHighlightCache = (): void => {
  walkCache.clear();
  highlightCache = undefined;
};
