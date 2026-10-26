import { WORLD_HEIGHT, WORLD_WIDTH, dockLandingGroundCoords, type LandingTerrainAt } from "@border-empires/shared";
import { clientTerrainAt } from "../client-dock-landing-ground/client-dock-landing-ground.js";
import type { DockPair, Tile } from "../client-types.js";

/**
 * Where the harbour draws its landing slipways, shared by the 2D and true-3D
 * renderers: one on every LAND beach of a dock's landing ground (packages/
 * shared dock-landing), facing the water. Purely visual -- the simulation has
 * no slipway; the beaches are landing ground whether or not one is drawn.
 */

export type SlipwayFit = "full" | "shrunk";

export type Facing = { readonly dx: number; readonly dy: number };

export type SlipwayPlacement = {
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly fit: SlipwayFit;
};

/**
 * Tile keys of every dock endpoint. Built from dockPairs since `tile.dockId`
 * is not reliably populated on every dock-endpoint snapshot; shared by the 2D
 * runtime loop and the 3D harbour placement.
 */
export const dockEndpointKeySet = (dockPairs: readonly DockPair[], keyFor: (x: number, y: number) => string): Set<string> => {
  const keys = new Set<string>();
  for (const pair of dockPairs) {
    keys.add(keyFor(pair.ax, pair.ay));
    keys.add(keyFor(pair.bx, pair.by));
  }
  return keys;
};

// Checked in this order when a tile faces water on more than one side.
const CARDINALS: readonly Facing[] = [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: -1, dy: 0 }];

const isWater = (terrain: string | undefined): boolean => terrain === "SEA" || terrain === "COASTAL_SEA";

/**
 * The cardinal direction from (x, y) toward water: `preferred` when that side
 * is water (so a dock's slipways line up with its quay), else the first water
 * side south, east, north, west. South when there is none.
 */
export const harbourFacingAt = (terrainAt: LandingTerrainAt, x: number, y: number, preferred?: Facing): Facing => {
  const waterOn = (facing: Facing): boolean =>
    isWater(terrainAt((x + facing.dx + WORLD_WIDTH) % WORLD_WIDTH, (y + facing.dy + WORLD_HEIGHT) % WORLD_HEIGHT));
  if (preferred && waterOn(preferred)) return preferred;
  return CARDINALS.find(waterOn) ?? CARDINALS[0]!;
};

/**
 * Three.js Y rotation that turns a model built facing +z (south) toward
 * `facing`: RY(t) maps +z to (sin t, 0, cos t), and scene x/z follow world
 * x/y. (The old dockRotationAt used -pi/2 for an east coast, which turned
 * docks on east and west coasts to face inland.)
 */
export const rotationForFacing = (facing: Facing): number => Math.atan2(facing.dx, facing.dy);

/**
 * How a slipway fits on a beach: hidden where something fills the tile (a
 * town, a natural wonder, an AFC), shrunk to the waterline beside any other
 * structure or resource, full on open beach.
 */
export const slipwayFitForTile = (tile: Tile | undefined): SlipwayFit | undefined => {
  if (!tile || tile.terrain !== "LAND") return undefined;
  if (tile.town || tile.naturalWonder || tile.afc || tile.dockId) return undefined;
  if (tile.fort || tile.observatory || tile.siegeBattery || tile.economicStructure || tile.watchtower || tile.waystation || tile.shardSite || tile.resource) {
    return "shrunk";
  }
  return "full";
};

/**
 * Every slipway to draw, keyed by tile key. O(dock pairs x 9). `terrainAt`
 * defaults to the tiles' own terrain; the 3D map passes its worldgen-backed
 * lookup so a beach whose tile hasn't streamed in still gets its slipway.
 */
export const slipwayPlacementsFor = (
  state: { readonly dockPairs: readonly DockPair[]; readonly tiles: ReadonlyMap<string, Tile> },
  terrainAt: LandingTerrainAt = clientTerrainAt(state.tiles)
): Map<string, SlipwayPlacement> => {
  const docks = new Map<string, { x: number; y: number }>();
  for (const pair of state.dockPairs) {
    docks.set(`${pair.ax},${pair.ay}`, { x: pair.ax, y: pair.ay });
    docks.set(`${pair.bx},${pair.by}`, { x: pair.bx, y: pair.by });
  }
  const placements = new Map<string, SlipwayPlacement>();
  for (const dock of docks.values()) {
    const quayFacing = harbourFacingAt(terrainAt, dock.x, dock.y);
    for (const { x, y } of dockLandingGroundCoords(dock.x, dock.y, terrainAt)) {
      const key = `${x},${y}`;
      if (docks.has(key) || placements.has(key)) continue;
      const fit = slipwayFitForTile(state.tiles.get(key));
      if (!fit) continue;
      placements.set(key, { x, y, facing: harbourFacingAt(terrainAt, x, y, quayFacing), fit });
    }
  }
  return placements;
};
