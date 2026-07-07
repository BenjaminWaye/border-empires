/**
 * Incremental per-viewer tile-visibility coverage.
 *
 * Replaces the old "invalidate-and-rebuild" eager visibility Set
 * (see git history of tile-delta-visibility-filter.ts) with a refcounted
 * raster that is updated O(radius²) per tile ownership change instead of
 * being rebuilt O(territory × radius²) on every change.
 *
 * A tile is visible to `viewerId` if at least one "source" contributes
 * coverage over it. A source is a player's own territory dilated by that
 * player's vision radius; a source's coverage is contributed to itself and
 * to each of its current allies (mirroring the old dilateTerritoryIntoSet
 * semantics: a viewer sees the dilation of its own territory plus the
 * dilation of each ally's territory, each at the source's own radius).
 *
 * Refcounts (not booleans) are required because overlapping dilation
 * footprints from different tiles — or from an ally's territory versus the
 * viewer's own — can cover the same cell. A cell must stay visible until
 * every contributing source has released it.
 */

import { simulationTileKey } from "./seed-state/seed-state.js";

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const separator = tileKey.indexOf(",");
  if (separator < 0) return undefined;
  const x = Number(tileKey.slice(0, separator));
  const y = Number(tileKey.slice(separator + 1));
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
};

export class VisibilityCoverageCache {
  private readonly coverage = new Map<string, Map<string, number>>();
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(worldWidth: number, worldHeight: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  isVisible(viewerId: string, tileKey: string): boolean {
    return (this.coverage.get(viewerId)?.get(tileKey) ?? 0) > 0;
  }

  /** Debug/test only — not on the hot path (allocates a new Set). */
  visibleKeysForViewer(viewerId: string): ReadonlySet<string> {
    return new Set(this.coverage.get(viewerId)?.keys() ?? []);
  }

  addFootprint(viewerId: string, x: number, y: number, radius: number): void {
    this.forEachDilatedCell(x, y, radius, (key) => {
      const map = this.mapFor(viewerId);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
  }

  removeFootprint(viewerId: string, x: number, y: number, radius: number): void {
    const map = this.coverage.get(viewerId);
    if (!map) return;
    this.forEachDilatedCell(x, y, radius, (key) => {
      const next = (map.get(key) ?? 0) - 1;
      if (next <= 0) map.delete(key);
      else map.set(key, next);
    });
    if (map.size === 0) this.coverage.delete(viewerId);
  }

  /** Bulk add — used for alliance formation and vision-radius resync. */
  addSourceContribution(viewerId: string, territoryTileKeys: Iterable<string>, radius: number): void {
    for (const tileKey of territoryTileKeys) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      this.addFootprint(viewerId, parsed.x, parsed.y, radius);
    }
  }

  /** Bulk remove — used for alliance breakage and vision-radius resync. */
  removeSourceContribution(viewerId: string, territoryTileKeys: Iterable<string>, radius: number): void {
    for (const tileKey of territoryTileKeys) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      this.removeFootprint(viewerId, parsed.x, parsed.y, radius);
    }
  }

  private mapFor(viewerId: string): Map<string, number> {
    let map = this.coverage.get(viewerId);
    if (!map) {
      map = new Map();
      this.coverage.set(viewerId, map);
    }
    return map;
  }

  private forEachDilatedCell(x: number, y: number, radius: number, cb: (key: string) => void): void {
    const W = this.worldWidth;
    const H = this.worldHeight;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = ((x + dx) % W + W) % W;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = ((y + dy) % H + H) % H;
        cb(simulationTileKey(nx, ny));
      }
    }
  }
}

export interface VisibilitySourcePlayer {
  readonly id: string;
  readonly allies: ReadonlySet<string>;
}

export interface VisibilityCoverageTrackerDeps {
  readonly visionRadiusForPlayer: (playerId: string) => number;
  readonly getPlayer: (playerId: string) => VisibilitySourcePlayer | undefined;
  readonly territoryTileKeysForPlayer: (playerId: string) => ReadonlySet<string>;
}

/**
 * Game-domain-aware glue around VisibilityCoverageCache: resolves viewers
 * (self + current allies), tracks the radius last used per source so
 * removals cancel out exactly what was added, and excludes barbarians (never
 * a subscribed gateway client, so a self-viewer entry for them is pure
 * waste on every walk/multiply tick). Takes its players/territory lookups
 * once at construction (mirrors VisionExpansionCache's constructor shape)
 * so call sites stay a single line each.
 */
export class VisibilityCoverageTracker {
  private readonly cache: VisibilityCoverageCache;
  private readonly deps: VisibilityCoverageTrackerDeps;
  private readonly radiusBySource = new Map<string, number>();

  constructor(worldWidth: number, worldHeight: number, deps: VisibilityCoverageTrackerDeps) {
    this.cache = new VisibilityCoverageCache(worldWidth, worldHeight);
    this.deps = deps;
  }

  isVisible(viewerId: string, tileKey: string): boolean {
    return this.cache.isVisible(viewerId, tileKey);
  }

  private isBarbarian(playerId: string): boolean {
    return playerId.startsWith("barbarian-");
  }

  private radiusForSource(sourceId: string): number {
    let radius = this.radiusBySource.get(sourceId);
    if (radius === undefined) {
      radius = this.deps.visionRadiusForPlayer(sourceId);
      this.radiusBySource.set(sourceId, radius);
    }
    return radius;
  }

  private viewersForSource(sourceId: string): string[] {
    if (this.isBarbarian(sourceId)) return [];
    const source = this.deps.getPlayer(sourceId);
    return source ? [sourceId, ...source.allies] : [sourceId];
  }

  /**
   * Call whenever a tile's owner changes (or is first assigned at boot):
   * cancels the previous owner's footprint at that cell and applies the new
   * owner's — O(radius²) total, the hot path this class exists to protect.
   */
  tileOwnershipChanged(previousOwnerId: string | undefined, nextOwnerId: string | undefined, x: number, y: number): void {
    if (previousOwnerId && !this.isBarbarian(previousOwnerId)) {
      const radius = this.radiusForSource(previousOwnerId);
      for (const viewerId of this.viewersForSource(previousOwnerId)) this.cache.removeFootprint(viewerId, x, y, radius);
    }
    if (nextOwnerId && !this.isBarbarian(nextOwnerId)) {
      const radius = this.radiusForSource(nextOwnerId);
      for (const viewerId of this.viewersForSource(nextOwnerId)) this.cache.addFootprint(viewerId, x, y, radius);
    }
  }

  /**
   * Call after a tech/domain choice that may have changed a player's
   * effective vision radius. Removes the whole territory's old-radius
   * contribution and re-adds it at the new radius — O(territory × radius²)
   * once, which is fine given tech/domain choices are rare (unlike the O(1)
   * per-tile hot path this class exists to protect).
   */
  resyncVisionRadius(playerId: string): void {
    const newRadius = this.deps.visionRadiusForPlayer(playerId);
    const oldRadius = this.radiusBySource.get(playerId);
    if (oldRadius === newRadius) return;
    const viewers = this.viewersForSource(playerId);
    if (viewers.length > 0) {
      const territoryTileKeys = this.deps.territoryTileKeysForPlayer(playerId);
      if (oldRadius !== undefined) {
        for (const viewerId of viewers) this.cache.removeSourceContribution(viewerId, territoryTileKeys, oldRadius);
      }
      for (const viewerId of viewers) this.cache.addSourceContribution(viewerId, territoryTileKeys, newRadius);
    }
    this.radiusBySource.set(playerId, newRadius);
  }

  /**
   * Call when two players become or stop being allies. Adds/removes each
   * side's entire current territory footprint to/from the other's coverage —
   * O(territory × radius²) once per alliance change (rare), instead of any
   * per-tile cost on the hot capture/loss path.
   */
  syncAllianceChange(actorId: string, targetId: string, allied: boolean): void {
    if (this.isBarbarian(actorId) || this.isBarbarian(targetId)) return;
    const actorRadius = this.radiusForSource(actorId);
    const targetRadius = this.radiusForSource(targetId);
    const actorTerritory = this.deps.territoryTileKeysForPlayer(actorId);
    const targetTerritory = this.deps.territoryTileKeysForPlayer(targetId);
    if (allied) {
      this.cache.addSourceContribution(targetId, actorTerritory, actorRadius);
      this.cache.addSourceContribution(actorId, targetTerritory, targetRadius);
    } else {
      this.cache.removeSourceContribution(targetId, actorTerritory, actorRadius);
      this.cache.removeSourceContribution(actorId, targetTerritory, targetRadius);
    }
  }
}
