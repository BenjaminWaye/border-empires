import type { DomainTileState } from "@border-empires/game-domain";
import { computeCoastalLandKeys, computeFairSpawnSites, computeLandRegions, type FairSpawnSite } from "./spawn-placement.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type SpawnPlacementCoord = { x: number; y: number };

const isSettledCoordTile = (tile: DomainTileState): boolean =>
  Boolean(tile.ownerId) && Boolean(tile.ownershipState) && tile.ownershipState !== "BARBARIAN";
const isTownCoordTile = (tile: DomainTileState): boolean => Boolean(tile.town);
const isFoodCoordTile = (tile: DomainTileState): boolean => tile.resource === "FARM" || tile.resource === "FISH";

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const manhattanDistance = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);

/**
 * Uniform-grid spatial index answering "is there a coordinate within radius
 * of (x,y)" in O(cells covering the radius) instead of O(all coordinates).
 *
 * chooseLegacySpawnPlacement's random-placement search calls this kind of
 * check up to ~24,000 times per spawn attempt (once per candidate tried
 * across its search passes). settledCoords in particular tracks every owned
 * tile across every player — not one point per player — so on a mature world
 * that's thousands of coordinates; a linear .some() scan against it, times
 * ~24,000 attempts, was found under load testing to cost ~230-250ms per new
 * player connecting (confirmed via direct instrumentation: settled=4888,
 * attempts=23000+ before the search's minSpawnDistance requirement finally
 * relaxed enough to succeed). Bucketing by a fixed cell size turns each
 * "nearby" check into a handful of small bucket scans instead.
 */
class CoordGrid {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, Map<string, SpawnPlacementCoord>>();
  private readonly cellKeyByEntryKey = new Map<string, string>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private cellKeyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }

  set(entryKey: string, coord: SpawnPlacementCoord): void {
    this.delete(entryKey);
    const cellKey = this.cellKeyFor(coord.x, coord.y);
    let bucket = this.buckets.get(cellKey);
    if (!bucket) {
      bucket = new Map<string, SpawnPlacementCoord>();
      this.buckets.set(cellKey, bucket);
    }
    bucket.set(entryKey, coord);
    this.cellKeyByEntryKey.set(entryKey, cellKey);
  }

  delete(entryKey: string): void {
    const cellKey = this.cellKeyByEntryKey.get(entryKey);
    if (cellKey === undefined) return;
    this.buckets.get(cellKey)?.delete(entryKey);
    this.cellKeyByEntryKey.delete(entryKey);
  }

  private forEachNearbyBucket(x: number, y: number, radius: number, visit: (bucket: ReadonlyMap<string, SpawnPlacementCoord>) => boolean): boolean {
    const cellRadius = Math.ceil(radius / this.cellSize) + 1;
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dy = -cellRadius; dy <= cellRadius; dy += 1) {
      for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
        const bucket = this.buckets.get(`${cx + dx}:${cy + dy}`);
        if (bucket && visit(bucket)) return true;
      }
    }
    return false;
  }

  // Chebyshev distance strictly less than radius — matches
  // chooseLegacySpawnPlacement's hasNearbySpawn semantics.
  hasWithinChebyshev(x: number, y: number, radius: number): boolean {
    return this.forEachNearbyBucket(x, y, radius, (bucket) => {
      for (const coord of bucket.values()) if (chebyshevDistance(x, y, coord.x, coord.y) < radius) return true;
      return false;
    });
  }

  // Manhattan distance less-than-or-equal radius — matches
  // chooseLegacySpawnPlacement's hasNearbyTown/hasNearbyFood semantics.
  hasWithinManhattan(x: number, y: number, radius: number): boolean {
    return this.forEachNearbyBucket(x, y, radius, (bucket) => {
      for (const coord of bucket.values()) if (manhattanDistance(x, y, coord.x, coord.y) <= radius) return true;
      return false;
    });
  }

  // Same as hasWithinManhattan, but a candidate coord must also satisfy
  // `matches` (used to require same-land-region membership so a resource
  // across water doesn't count as "nearby").
  hasWithinManhattanMatching(x: number, y: number, radius: number, matches: (coord: SpawnPlacementCoord) => boolean): boolean {
    return this.forEachNearbyBucket(x, y, radius, (bucket) => {
      for (const coord of bucket.values()) if (manhattanDistance(x, y, coord.x, coord.y) <= radius && matches(coord)) return true;
      return false;
    });
  }

  // All coords currently tracked by this grid, for callers that need to rank
  // candidates by actual distance rather than just a within-radius check
  // (e.g. picking the spawn site farthest from every settled player).
  values(): SpawnPlacementCoord[] {
    const all: SpawnPlacementCoord[] = [];
    for (const bucket of this.buckets.values()) for (const coord of bucket.values()) all.push(coord);
    return all;
  }
}

/**
 * Backs chooseLegacySpawnPlacement's map-wide lookups (coastalLandKeys,
 * hasNearbySettled/hasNearbyTown/hasNearbyFood) with data maintained
 * incrementally instead of rescanned from every tile on the map — and, for
 * the "nearby" checks, indexed spatially instead of linearly scanned — on
 * every single spawn/respawn placement call. That combined cost (called once
 * per new player connecting, via PreparePlayer -> ensurePlayerHasSpawnTerritory)
 * was found under concurrent-player load testing to dominate connect/INIT
 * latency at scale.
 *
 * coastalLandKeys/foodCoords derive only from tile.terrain/tile.resource,
 * neither of which changes after worldgen, so both are computed once,
 * lazily, on first real use (never cached while the world hasn't hydrated
 * yet, matching the same boot-order caution as the manpower/monument cache
 * in runtime.ts). settled/town grids depend on ownership/town state, which
 * changes on every tile mutation, so refreshForTileChange keeps them
 * incrementally in sync — the same add/remove-per-tile-change idiom already
 * used for the per-owner tile-set indexes in runtime-tile-index-maintenance.ts,
 * just keyed globally instead of per-owner.
 */
export class SpawnPlacementIndex {
  private static readonly CELL_SIZE = 25;

  private readonly settledGrid = new CoordGrid(SpawnPlacementIndex.CELL_SIZE);
  private readonly townGrid = new CoordGrid(SpawnPlacementIndex.CELL_SIZE);
  private coastalLandKeysCache: ReadonlySet<string> | undefined;
  private foodGridCache: CoordGrid | undefined;
  private landRegionByTileKeyCache: ReadonlyMap<string, number> | undefined;
  private fairSpawnSitesCache: readonly FairSpawnSite[] | undefined;

  refreshForTileChange(tileKey: string, next: DomainTileState): void {
    if (isSettledCoordTile(next)) this.settledGrid.set(tileKey, { x: next.x, y: next.y });
    else this.settledGrid.delete(tileKey);
    if (isTownCoordTile(next)) this.townGrid.set(tileKey, { x: next.x, y: next.y });
    else this.townGrid.delete(tileKey);
  }

  hasNearbySettled(x: number, y: number, radius: number): boolean {
    return this.settledGrid.hasWithinChebyshev(x, y, radius);
  }

  // A town/food coord only counts as "nearby" if it's also on the same land
  // region as (x,y) — otherwise a resource across water satisfies the
  // Manhattan-distance check and a spawn gets accepted next to food/a town
  // the player can't actually reach without crossing water.
  hasNearbyTown(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number, radius: number): boolean {
    const originRegion = this.landRegionOf(tiles, x, y);
    return this.townGrid.hasWithinManhattanMatching(
      x,
      y,
      radius,
      (coord) => originRegion === undefined || this.landRegionOf(tiles, coord.x, coord.y) === originRegion
    );
  }

  hasNearbyFood(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number, radius: number): boolean {
    const originRegion = this.landRegionOf(tiles, x, y);
    return this.foodGrid(tiles).hasWithinManhattanMatching(
      x,
      y,
      radius,
      (coord) => originRegion === undefined || this.landRegionOf(tiles, coord.x, coord.y) === originRegion
    );
  }

  coastalLandKeys(tiles: ReadonlyMap<string, DomainTileState>): ReadonlySet<string> {
    if (tiles.size === 0) return this.coastalLandKeysCache ?? new Set<string>();
    if (!this.coastalLandKeysCache) this.coastalLandKeysCache = computeCoastalLandKeys([...tiles.values()]);
    return this.coastalLandKeysCache;
  }

  private landRegionOf(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number): number | undefined {
    if (tiles.size === 0) return this.landRegionByTileKeyCache?.get(simulationTileKey(x, y));
    if (!this.landRegionByTileKeyCache) this.landRegionByTileKeyCache = computeLandRegions([...tiles.values()]);
    return this.landRegionByTileKeyCache.get(simulationTileKey(x, y));
  }

  // Worldgen-time roster of pre-picked, equal-opportunity spawn sites — see
  // computeFairSpawnSites. Computed once, lazily, on first real use (same
  // caution as coastalLandKeysCache: never cache while the world hasn't
  // hydrated yet), and reused for every player placement afterwards instead
  // of each player running their own random search from scratch.
  fairSpawnSites(tiles: ReadonlyMap<string, DomainTileState>): readonly FairSpawnSite[] {
    if (tiles.size === 0) return this.fairSpawnSitesCache ?? [];
    if (!this.fairSpawnSitesCache) this.fairSpawnSitesCache = computeFairSpawnSites([...tiles.values()]);
    return this.fairSpawnSitesCache;
  }

  // Picks the best still-available precomputed site: nearest to rallyAnchor
  // (Chebyshev) when given one, otherwise the one farthest (by minimum
  // Chebyshev distance) from every currently-settled player — so a joining
  // player always lands as far from existing empires as the roster allows,
  // rather than just the first open slot in worldgen fill order. `isAvailable`
  // is the caller's live-tile check (unowned/no town/no dock/not blocked) — a
  // site is never marked "used" here, since that same live check already lets
  // a site free up again if its player is later eliminated/abandons it,
  // instead of retiring it from the roster forever.
  claimFairSpawnSite(
    tiles: ReadonlyMap<string, DomainTileState>,
    isAvailable: (x: number, y: number) => boolean,
    rallyAnchor?: SpawnPlacementCoord
  ): FairSpawnSite | undefined {
    const sites = this.fairSpawnSites(tiles);
    const available = sites.filter((site) => isAvailable(site.x, site.y));
    if (available.length === 0) return undefined;
    if (rallyAnchor) {
      let best: FairSpawnSite | undefined;
      let bestDistance = Infinity;
      for (const site of available) {
        const distance = chebyshevDistance(site.x, site.y, rallyAnchor.x, rallyAnchor.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = site;
        }
      }
      return best;
    }
    const settledCoords = this.settledGrid.values();
    if (settledCoords.length === 0) return available[0];
    let best: FairSpawnSite | undefined;
    let bestMinDistance = -1;
    for (const site of available) {
      let minDistance = Infinity;
      for (const settled of settledCoords) {
        const distance = chebyshevDistance(site.x, site.y, settled.x, settled.y);
        if (distance < minDistance) minDistance = distance;
        if (minDistance <= bestMinDistance) break;
      }
      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance;
        best = site;
      }
    }
    return best;
  }

  private foodGrid(tiles: ReadonlyMap<string, DomainTileState>): CoordGrid {
    if (tiles.size === 0) return this.foodGridCache ?? new CoordGrid(SpawnPlacementIndex.CELL_SIZE);
    if (!this.foodGridCache) {
      const grid = new CoordGrid(SpawnPlacementIndex.CELL_SIZE);
      for (const [tileKey, tile] of tiles) if (isFoodCoordTile(tile)) grid.set(tileKey, { x: tile.x, y: tile.y });
      this.foodGridCache = grid;
    }
    return this.foodGridCache;
  }
}
