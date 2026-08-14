import type { DomainTileState } from "@border-empires/game-domain";
import { computeCoastalLandKeys } from "./spawn-placement.js";

export type SpawnPlacementCoord = { x: number; y: number };

const isSettledCoordTile = (tile: DomainTileState): boolean =>
  Boolean(tile.ownerId) && Boolean(tile.ownershipState) && tile.ownershipState !== "BARBARIAN";
const isTownCoordTile = (tile: DomainTileState): boolean => Boolean(tile.town);
const isFoodCoordTile = (tile: DomainTileState): boolean => tile.resource === "FARM" || tile.resource === "FISH";

/**
 * Backs chooseLegacySpawnPlacement's map-wide lookups (coastalLandKeys,
 * settledCoords, townCoords, foodCoords) with data maintained incrementally
 * instead of rescanned from every tile on the map on every single
 * spawn/respawn placement call — that O(tiles) rescan (called once per new
 * player connecting, via PreparePlayer -> ensurePlayerHasSpawnTerritory) was
 * found under concurrent-player load testing to dominate connect/INIT
 * latency at scale.
 *
 * coastalLandKeys/foodCoords derive only from tile.terrain/tile.resource,
 * neither of which changes after worldgen, so both are computed once,
 * lazily, on first real use (never cached while the world hasn't hydrated
 * yet, matching the same boot-order caution as the manpower/monument cache
 * in runtime.ts). settledCoords/townCoords depend on ownership/town state,
 * which changes on every tile mutation, so refreshForTileChange keeps them
 * incrementally in sync — the same add/remove-per-tile-change idiom already
 * used for the per-owner tile-set indexes in runtime-tile-index-maintenance.ts,
 * just keyed globally instead of per-owner.
 */
export class SpawnPlacementIndex {
  private readonly settled = new Map<string, SpawnPlacementCoord>();
  private readonly towns = new Map<string, SpawnPlacementCoord>();
  private coastalLandKeysCache: ReadonlySet<string> | undefined;
  private foodCoordsCache: readonly SpawnPlacementCoord[] | undefined;

  refreshForTileChange(tileKey: string, next: DomainTileState): void {
    if (isSettledCoordTile(next)) this.settled.set(tileKey, { x: next.x, y: next.y });
    else this.settled.delete(tileKey);
    if (isTownCoordTile(next)) this.towns.set(tileKey, { x: next.x, y: next.y });
    else this.towns.delete(tileKey);
  }

  settledCoords(): Iterable<SpawnPlacementCoord> {
    return this.settled.values();
  }

  townCoords(): Iterable<SpawnPlacementCoord> {
    return this.towns.values();
  }

  coastalLandKeys(tiles: ReadonlyMap<string, DomainTileState>): ReadonlySet<string> {
    if (tiles.size === 0) return this.coastalLandKeysCache ?? new Set<string>();
    if (!this.coastalLandKeysCache) this.coastalLandKeysCache = computeCoastalLandKeys([...tiles.values()]);
    return this.coastalLandKeysCache;
  }

  foodCoords(tiles: ReadonlyMap<string, DomainTileState>): Iterable<SpawnPlacementCoord> {
    if (tiles.size === 0) return this.foodCoordsCache ?? [];
    if (!this.foodCoordsCache) {
      const coords: SpawnPlacementCoord[] = [];
      for (const tile of tiles.values()) if (isFoodCoordTile(tile)) coords.push({ x: tile.x, y: tile.y });
      this.foodCoordsCache = coords;
    }
    return this.foodCoordsCache;
  }
}
