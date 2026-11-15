// Per-runtime House Charges geometry, derived from the tile map and never
// snapshotted: the island registry (shared with island naming), desert and
// tundra regions, and the fixed positions of towns and relics. Cached per tile
// map (a new season builds a new runtime with a new map), so the ticker and
// crowning share one build without runtime wiring.
import { generatedBiomeRegionName, type DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, getWorldSeed } from "@border-empires/shared";
import type { IslandRegistry } from "../island-names/island-registry.js";
import { islandNamesWorldFor, type IslandNamesWorld } from "../island-names/island-names-world.js";
import { buildBiomeRegionRegistry, type BiomeRegionRegistry, type BiomeRegionRecord } from "./biome-region-registry.js";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "../dock-network/dock-network.js";

export type ChargeTownSite = { readonly key: string; readonly x: number; readonly y: number; readonly islandId: string | undefined };
export type ChargeRelicSite = { readonly key: string; readonly x: number; readonly y: number };

export type HouseChargesWorld = {
  readonly width: number;
  readonly height: number;
  readonly islandNames: IslandNamesWorld;
  readonly islands: IslandRegistry;
  readonly regions: BiomeRegionRegistry;
  readonly towns: readonly ChargeTownSite[];
  readonly relics: readonly ChargeRelicSite[];
  /** Islands with at least one dock: a Charter may join towns on two of them by sea (house-charge-held.ts). */
  readonly dockedIslandIds: ReadonlySet<string>;
  /** Dock tile key -> the dock tile keys it links to (worldgen dock routes); empty until docks are supplied. */
  dockLinks: ReadonlyMap<string, readonly string[]>;
  readonly regionName: (region: BiomeRegionRecord) => string;
};

const worldsByTiles = new WeakMap<ReadonlyMap<string, DomainTileState>, HouseChargesWorld>();

const dockLinksSourceByWorld = new WeakMap<HouseChargesWorld, readonly DockRouteDefinition[]>();

export const houseChargesWorldFor = (
  tiles: ReadonlyMap<string, DomainTileState>,
  docks?: readonly DockRouteDefinition[],
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): HouseChargesWorld => {
  const cached = worldsByTiles.get(tiles);
  if (cached) {
    // Dock routes are fixed at worldgen; rebuild the links only if a different list is supplied.
    if (docks && dockLinksSourceByWorld.get(cached) !== docks) {
      cached.dockLinks = buildDockLinksByDockTileKey(docks);
      dockLinksSourceByWorld.set(cached, docks);
    }
    return cached;
  }
  const islandNames = islandNamesWorldFor(tiles);
  const towns: ChargeTownSite[] = [];
  const relics: ChargeRelicSite[] = [];
  const dockedIslandIds = new Set<string>();
  for (const [key, tile] of tiles) {
    if (tile.dockId) {
      const islandId = islandNames.registry.islandAt(tile.x, tile.y)?.id;
      if (islandId) dockedIslandIds.add(islandId);
    }
    if (tile.town) towns.push({ key, x: tile.x, y: tile.y, islandId: islandNames.registry.islandAt(tile.x, tile.y)?.id });
    if (tile.naturalWonder) relics.push({ key, x: tile.x, y: tile.y });
  }
  towns.sort((a, b) => a.y - b.y || a.x - b.x);
  relics.sort((a, b) => a.y - b.y || a.x - b.x);
  const worldSeed = getWorldSeed();
  const regionNames = new Map<string, string>();
  const world: HouseChargesWorld = {
    width,
    height,
    islandNames,
    islands: islandNames.registry,
    regions: buildBiomeRegionRegistry(tiles, width, height),
    towns,
    relics,
    dockedIslandIds,
    dockLinks: docks ? buildDockLinksByDockTileKey(docks) : new Map(),
    regionName: (region) => {
      let name = regionNames.get(region.id);
      if (name === undefined) {
        name = generatedBiomeRegionName(worldSeed, region.id, region.kind);
        regionNames.set(region.id, name);
      }
      return name;
    }
  };
  worldsByTiles.set(tiles, world);
  if (docks) dockLinksSourceByWorld.set(world, docks);
  return world;
};

/** Wrapped Manhattan distance, matching 4-neighbour movement on the wrapping world. */
export const chargeDistance = (world: Pick<HouseChargesWorld, "width" | "height">, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.min(dx, world.width - dx) + Math.min(dy, world.height - dy);
};

/** Nearest member cell of `cells` to `from`, with its distance. */
export const nearestCell = (
  world: Pick<HouseChargesWorld, "width" | "height">,
  cells: Int32Array,
  from: { x: number; y: number }
): { x: number; y: number; distance: number } => {
  let best = { x: from.x, y: from.y, distance: Number.POSITIVE_INFINITY };
  for (const cell of cells) {
    const point = { x: cell % world.width, y: Math.floor(cell / world.width) };
    const distance = chargeDistance(world, from, point);
    if (distance < best.distance) best = { ...point, distance };
  }
  return best;
};
