// Guide input for the last chapter, "First battle" (owner decision 2026-11-28):
// the guide sends the scout drone to the nearest Insurgent camp, then walks the
// player through mustering, the odds, the attack and taking the camp.
//
// The camp the chapter is about is the server's camp lead (state.guideCampLead,
// the nearest live camp the player has never seen; its guided flight is free)
// while that tile is still fog, else the nearest live camp on the client's map
// near home. It is remembered per player, so the chapter can tell the camp
// fell to the player after the tile stops being a camp. The tile scan is cached
// per tiles revision, as the rest of the guide input is (tutorial-guide-input.ts).

import { tileKey, WORLD_HEIGHT, WORLD_WIDTH, wrappedChebyshevDistance, wrapX, wrapY } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { isPlanetaryDefenseCampTile } from "../client-planetary-defense-style.js";

type Point = { x: number; y: number };

/** How far from home (wrapped Chebyshev) a camp on the map counts: the simulation's camp lead search radius. */
export const GUIDE_CAMP_RANGE_TILES = 35;
const MAX_FLAG_TILES = 3;

export type GuideCamp = {
  /** The camp the chapter is about, if any. */
  target?: Point;
  /** The target is the server's lead and still fog: the chapter asks for the free drone flight. */
  inFog: boolean;
  /** The target camp is on the player's map (live, or remembered under fog). */
  sighted: boolean;
  /** The player holds the camp tile the chapter pointed at. */
  won: boolean;
  /** The camp touches the player's land: Launch Attack works; otherwise March Attack from a flag. */
  bordersMine: boolean;
  /** The camp tile is selected: its tile menu shows the attack odds. */
  selected: boolean;
  /** The player's flag-free land nearest the camp: where the first flag goes. */
  flagTiles: ReadonlyArray<Point>;
};

export type GuideCampState = Pick<ClientState, "tiles" | "tilesRevision" | "chunkFullCount" | "me" | "homeTile" | "guideCampLead" | "discoveredTiles" | "selected">;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
] as const;

const distance = (a: Point, b: Point): number => wrappedChebyshevDistance(a.x, a.y, b.x, b.y);

/** The live camp tile on the client's map nearest home, within GUIDE_CAMP_RANGE_TILES. */
export const nearestKnownCamp = (tiles: Iterable<Tile>, home: Point | undefined): Point | undefined => {
  if (!home) return undefined;
  let best: { x: number; y: number; d: number } | undefined;
  for (const tile of tiles) {
    if (!isPlanetaryDefenseCampTile(tile)) continue;
    const d = distance(tile, home);
    if (d <= GUIDE_CAMP_RANGE_TILES && (!best || d < best.d)) best = { x: tile.x, y: tile.y, d };
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/** The player's own land with no flag on it, nearest `camp` first. */
export const flagTilesToward = (tiles: Iterable<Tile>, me: string, camp: Point): Point[] => {
  const free: Array<Point & { d: number }> = [];
  for (const tile of tiles) {
    if (tile.ownerId !== me || tile.terrain !== "LAND" || tile.muster || tile.optimisticPending) continue;
    free.push({ x: tile.x, y: tile.y, d: distance(tile, camp) });
  }
  return free
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_FLAG_TILES)
    .map(({ x, y }) => ({ x, y }));
};

const bordersMine = (tiles: ReadonlyMap<string, Tile>, camp: Point, me: string): boolean =>
  NEIGHBOURS.some(([dx, dy]) => tiles.get(tileKey(wrapX(camp.x + dx, WORLD_WIDTH), wrapY(camp.y + dy, WORLD_HEIGHT)))?.ownerId === me);

// The camp the chapter last pointed at, per player: it stays the target after it falls, so `won` can see it.
let remembered: { me: string; camp: Point } | undefined;
// Both scans walk every known tile: cached per tiles revision (and per target for the flag tiles).
let scanCache: { tiles: ReadonlyMap<string, Tile>; revision: number; chunks: number; me: string; known: Point | undefined; flags?: { key: string; tiles: Point[] } } | undefined;

const freshScan = (state: GuideCampState): NonNullable<typeof scanCache> => {
  if (!scanCache || scanCache.tiles !== state.tiles || scanCache.revision !== state.tilesRevision || scanCache.chunks !== state.chunkFullCount || scanCache.me !== state.me) {
    scanCache = { tiles: state.tiles, revision: state.tilesRevision, chunks: state.chunkFullCount, me: state.me, known: nearestKnownCamp(state.tiles.values(), state.homeTile) };
  }
  return scanCache;
};

const flagTilesOf = (state: GuideCampState, camp: Point): Point[] => {
  const scan = freshScan(state);
  const key = tileKey(camp.x, camp.y);
  if (scan.flags?.key !== key) scan.flags = { key, tiles: flagTilesToward(state.tiles.values(), state.me, camp) };
  return scan.flags.tiles;
};

const leadInFog = (state: GuideCampState): Point | undefined => {
  const lead = state.guideCampLead;
  if (!lead) return undefined;
  const key = tileKey(lead.x, lead.y);
  return state.discoveredTiles.has(key) || state.tiles.has(key) ? undefined : lead;
};

export const guideCampOf = (state: GuideCampState): GuideCamp => {
  if (remembered && remembered.me !== state.me) remembered = undefined;
  const fog = leadInFog(state);
  const rememberedTile = remembered ? state.tiles.get(tileKey(remembered.camp.x, remembered.camp.y)) : undefined;
  // Keep the camp already pointed at while it stands or has just become the player's; otherwise the nearest one.
  const keep = remembered && (isPlanetaryDefenseCampTile(rememberedTile) || rememberedTile?.ownerId === state.me) ? remembered.camp : undefined;
  const target = keep ?? fog ?? freshScan(state).known;
  if (!target) return { inFog: false, sighted: false, won: false, bordersMine: false, selected: false, flagTiles: [] };
  remembered = { me: state.me, camp: target };
  const tile = state.tiles.get(tileKey(target.x, target.y));
  const won = tile?.ownerId === state.me;
  return {
    target,
    inFog: !keep && fog !== undefined,
    sighted: won || isPlanetaryDefenseCampTile(tile),
    won,
    bordersMine: bordersMine(state.tiles, target, state.me),
    selected: state.selected?.x === target.x && state.selected.y === target.y,
    flagTiles: won ? [] : flagTilesOf(state, target)
  };
};

/** Test-only: forgets the remembered camp and the scan. */
export const resetGuideCampForTests = (): void => {
  remembered = undefined;
  scanCache = undefined;
};
