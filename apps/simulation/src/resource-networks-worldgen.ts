import type { DomainTileState } from "@border-empires/game-domain";
import {
  NETWORK_RESOURCES, RESOURCE_NETWORKS, emptyNetworkSiteCounts, isForestTileAt, isHillsTileAt,
  isTropicalForestLatitudeAt, landBiomeAt, isNetworkResource, networkBiomePriority, type NetworkBiomeContext,
  type NetworkResource, type NetworkSiteCounts
} from "@border-empires/shared";
import {
  isEmptyNetworkSite, networkPlacementHash as hash, networkTileKey as keyFor, protectedNetworkLandingKeys
} from "./resource-networks/resource-network-placement.js";

export type NetworkBiomeReader = (tile: DomainTileState) => NetworkBiomeContext;
export type NetworkPlacementStats = { readonly targets: NetworkSiteCounts; readonly placed: NetworkSiteCounts; readonly clusters: NetworkSiteCounts };
const CARDINALS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Finite terrain pools; connected deposits contain 1–3 tiles, including diagonals. */
export function seedResourceNetworks(tiles: Map<string, DomainTileState>, seed: number, width: number, height: number,
  readBiome?: NetworkBiomeReader): NetworkPlacementStats {
  const candidates = [...tiles.values()].filter(isEmptyNetworkSite);
  const protectedKeys = protectedNetworkLandingKeys([...tiles.values()], width, height);
  const contexts = new Map<string, NetworkBiomeContext>(); // Bounded by candidate/world area, discarded after generation.
  const sectors = new Map<string, DomainTileState[]>();
  for (const tile of candidates) {
    const key = keyFor(tile.x, tile.y, width, height);
    if (protectedKeys.has(key)) continue;
    const context = readBiome?.(tile) ?? {
      biome: tile.landBiome ?? landBiomeAt(tile.x, tile.y), forest: isForestTileAt(tile.x, tile.y),
      hills: isHillsTileAt(tile.x, tile.y), tropical: isTropicalForestLatitudeAt(tile.y),
      nearMountains: CARDINALS.some(([dx, dy]) => tiles.get(keyFor(tile.x + dx, tile.y + dy, width, height))?.terrain === "MOUNTAIN")
    };
    contexts.set(key, context);
    const sectorKey = `${Math.floor(tile.x / 32)},${Math.floor(tile.y / 32)}`;
    const sector = sectors.get(sectorKey) ?? [];
    sector.push(tile); sectors.set(sectorKey, sector);
  }
  const targets = emptyNetworkSiteCounts(), placed = emptyNetworkSiteCounts(), clusters = emptyNetworkSiteCounts();
  for (const tile of tiles.values()) if (isNetworkResource(tile.resource)) placed[tile.resource] += 1;
  const available = (tile: DomainTileState, resource: NetworkResource, phase: number, group: ReadonlySet<string>): boolean => {
    const key = keyFor(tile.x, tile.y, width, height), context = contexts.get(key);
    if (!context || tiles.get(key)?.resource) return false;
    const priority = networkBiomePriority(resource, context);
    if (priority === undefined || priority > phase) return false;
    // Distinct same-resource deposits cannot merge into a larger connected vein.
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const neighbour = keyFor(tile.x + dx, tile.y + dy, width, height);
      if (tiles.get(neighbour)?.resource === resource && !group.has(neighbour)) return false;
    }
    return true;
  };
  for (const [resourceIndex, resource] of NETWORK_RESOURCES.entries()) {
    const target = Math.round(RESOURCE_NETWORKS[resource].sitesPerStandardMap * width * height / (640 * 320));
    targets[resource] = target;
    const resourceSeed = seed ^ Math.imul(resourceIndex + 1, 104729);
    for (const phase of [0, 1]) {
      const pools = [...sectors.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sector]) => sector
        .filter(tile => networkBiomePriority(resource, contexts.get(keyFor(tile.x, tile.y, width, height))!) === phase)
        .sort((a, b) => hash(resourceSeed, b.x, b.y) - hash(resourceSeed, a.x, a.y) || b.y - a.y || b.x - a.x));
      let progress = true;
      while (placed[resource] < target && progress) {
        progress = false;
        for (const pool of pools) {
          let centre: DomainTileState | undefined;
          while (pool.length) {
            const tile = pool.pop()!;
            if (available(tile, resource, phase, new Set())) { centre = tile; break; }
          }
          if (!centre) continue;
          progress = true;
          const desired = Math.min(1 + hash(resourceSeed + 19, centre.x, centre.y) % 3, target - placed[resource]);
          const group = new Set<string>(); // Hard-bounded by desired <= 3.
          const members: DomainTileState[] = [];
          const add = (tile: DomainTileState): void => {
            const key = keyFor(tile.x, tile.y, width, height);
            group.add(key); members.push(tile); tiles.set(key, { ...tile, resource }); placed[resource] += 1;
          };
          add(centre);
          while (members.length < desired) {
            const neighbours = members.flatMap(tile => CARDINALS.map(([dx, dy]) => tiles.get(keyFor(tile.x + dx, tile.y + dy, width, height))))
              .filter((tile): tile is DomainTileState => tile !== undefined && !group.has(keyFor(tile.x, tile.y, width, height)))
              .sort((a, b) => hash(resourceSeed + 31, a.x, a.y) - hash(resourceSeed + 31, b.x, b.y));
            const next = neighbours.find(tile => available(tile, resource, phase, group));
            if (!next) break;
            add(next);
          }
          clusters[resource] += 1;
          if (placed[resource] >= target) break;
        }
      }
      if (placed[resource] >= target) break;
    }
  }
  const shortfalls = NETWORK_RESOURCES.filter(resource => placed[resource] < targets[resource]);
  if (shortfalls.length && width * height >= 640 * 320)
    console.warn(JSON.stringify({ event: "resource_network_placement_shortfall", targets, placed, clusters }));
  return { targets, placed, clusters };
}
