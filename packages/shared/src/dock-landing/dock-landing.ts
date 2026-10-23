/**
 * Beach landings: where a dock crossing may come ashore.
 *
 * A crossing from a dock you own may target the linked dock itself or any
 * coastal LAND tile within DOCK_LANDING_RADIUS of it -- the harbour's
 * "landing ground". Coastal means water on at least one cardinal side, the
 * same test worldgen uses to paint COASTAL_SAND. Water never changes after
 * worldgen, so the ground a dock can land on is static; only whether a tile
 * is currently LAND (Create/Remove Mountain) is checked live, by the caller
 * or by `isDockLandingTile`.
 *
 * Shared by the simulation (crossing validation, muster pathing, sea-lane
 * supply) and the client (origin selection, menus, landing-ground highlight,
 * supply lines) so both always agree on the rule.
 */

import { DOCK_LANDING_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import type { Terrain } from "../types.js";

// Plain strings are accepted so planner tile views (whose terrain is typed
// `string`) can be read directly; anything but these literals counts as land-like.
export type LandingTerrainAt = (x: number, y: number) => Terrain | string | undefined;

const isWater = (terrain: string | undefined): boolean => terrain === "SEA" || terrain === "COASTAL_SEA";

export type DockLandingOptions = {
  radius?: number;
  worldWidth?: number;
  worldHeight?: number;
};

const CARDINAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

const wrappedDistance = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
};

/** Non-water ground with water on at least one cardinal side. */
export const isCoastalGround = (
  x: number,
  y: number,
  terrainAt: LandingTerrainAt,
  worldWidth = WORLD_WIDTH,
  worldHeight = WORLD_HEIGHT
): boolean => {
  const terrain = terrainAt(x, y);
  if (!terrain || isWater(terrain)) return false;
  for (const [dx, dy] of CARDINAL_OFFSETS) {
    if (isWater(terrainAt(wrapX(x + dx, worldWidth), wrapY(y + dy, worldHeight)))) return true;
  }
  return false;
};

/**
 * True when (tx, ty) is landing ground of the dock at (dockX, dockY) and is
 * LAND right now: the dock tile itself, or a coastal LAND tile within the
 * landing radius of it.
 */
export const isDockLandingTile = (
  dockX: number,
  dockY: number,
  tx: number,
  ty: number,
  terrainAt: LandingTerrainAt,
  options: DockLandingOptions = {}
): boolean => {
  if (dockX === tx && dockY === ty) return true;
  const width = options.worldWidth ?? WORLD_WIDTH;
  const height = options.worldHeight ?? WORLD_HEIGHT;
  const radius = options.radius ?? DOCK_LANDING_RADIUS;
  if (Math.max(wrappedDistance(dockX, tx, width), wrappedDistance(dockY, ty, height)) > radius) return false;
  return terrainAt(tx, ty) === "LAND" && isCoastalGround(tx, ty, terrainAt, width, height);
};

/**
 * The dock tile followed by every coastal non-water tile within the landing
 * radius of it. Mountains are included so the static set stays right when a
 * coastal mountain is later removed; callers still require LAND to land.
 */
export const dockLandingGroundCoords = (
  dockX: number,
  dockY: number,
  terrainAt: LandingTerrainAt,
  options: DockLandingOptions = {}
): Array<{ x: number; y: number }> => {
  const width = options.worldWidth ?? WORLD_WIDTH;
  const height = options.worldHeight ?? WORLD_HEIGHT;
  const radius = options.radius ?? DOCK_LANDING_RADIUS;
  const out: Array<{ x: number; y: number }> = [{ x: dockX, y: dockY }];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrapX(dockX + dx, width);
      const y = wrapY(dockY + dy, height);
      if (isCoastalGround(x, y, terrainAt, width, height)) out.push({ x, y });
    }
  }
  return out;
};

export type DockLandingIndex = {
  /** Origin dock tile key -> landing ground of every dock it links to (the linked docks themselves included). */
  readonly landingTileKeysByOriginDockKey: ReadonlyMap<string, readonly string[]>;
  /**
   * Sea-lane supply edges, symmetric: an origin dock lists its landing
   * ground, and each landing tile lists the docks that can land on it.
   */
  readonly seaLaneNeighborKeysByTileKey: ReadonlyMap<string, readonly string[]>;
};

const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

const addEdge = (edges: Map<string, Set<string>>, from: string, to: string): void => {
  const set = edges.get(from);
  if (set) set.add(to);
  else edges.set(from, new Set([to]));
};

/**
 * Built once per world from the (static) dock links and terrain. Size is
 * bounded by docks x links x (2r+1)^2, a few thousand keys at most.
 */
export const buildDockLandingIndex = (
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  terrainAt: LandingTerrainAt,
  options: DockLandingOptions = {}
): DockLandingIndex => {
  const groundByDockKey = new Map<string, string[]>();
  const groundFor = (dockKey: string): string[] => {
    const cached = groundByDockKey.get(dockKey);
    if (cached) return cached;
    const coords = parseKey(dockKey);
    const keys = coords
      ? dockLandingGroundCoords(coords.x, coords.y, terrainAt, options).map(({ x, y }) => `${x},${y}`)
      : [];
    groundByDockKey.set(dockKey, keys);
    return keys;
  };
  const landing = new Map<string, Set<string>>();
  const seaLane = new Map<string, Set<string>>();
  for (const [originKey, linkedKeys] of dockLinksByDockTileKey) {
    for (const linkedKey of linkedKeys) {
      for (const landingKey of groundFor(linkedKey)) {
        if (landingKey === originKey) continue;
        addEdge(landing, originKey, landingKey);
        addEdge(seaLane, originKey, landingKey);
        addEdge(seaLane, landingKey, originKey);
      }
    }
  }
  const freeze = (edges: Map<string, Set<string>>): Map<string, readonly string[]> =>
    new Map([...edges].map(([key, set]) => [key, [...set]] as const));
  return { landingTileKeysByOriginDockKey: freeze(landing), seaLaneNeighborKeysByTileKey: freeze(seaLane) };
};

export const EMPTY_DOCK_LANDING_INDEX: DockLandingIndex = {
  landingTileKeysByOriginDockKey: new Map(),
  seaLaneNeighborKeysByTileKey: new Map()
};
