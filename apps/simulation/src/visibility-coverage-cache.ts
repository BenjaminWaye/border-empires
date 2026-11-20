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

import { FRONTIER_STANDING_VISION_RADIUS } from "@border-empires/shared";
import { VisibilityCoverageCache } from "./visibility-coverage-raster.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { SourceBonusRadiusTracker } from "./visibility-source-bonus-tracker.js";
import { parseVisibilityTileKey as parseTileKey } from "./visibility-tile-key.js";
import type { VisionFootprintTable } from "./vision-footprint-table.js";

export { VisibilityCoverageCache };

export interface VisibilitySourcePlayer {
  readonly id: string;
  readonly allies: ReadonlySet<string>;
}

/**
 * Optional per-call transition collector. Threaded through the tracker's
 * mutating methods so a caller can observe exactly which (viewerId,
 * tileKey) pairs entered/left coverage as a *result of that specific call*
 * — used by the fog-of-war FOG delta mechanism (see runtime-vision-transition.ts)
 * to know which tiles just left/entered a player's vision this tick. Not a
 * global listener: deliberately opt-in per call so bulk operations that
 * don't represent a meaningful "this tick" boundary (e.g. initial world
 * seeding) can omit it.
 */
export interface VisibilityTransitionCallbacks {
  readonly onEnter?: (viewerId: string, tileKey: string) => void;
  readonly onLeave?: (viewerId: string, tileKey: string) => void;
}

export interface VisibilityCoverageTrackerDeps {
  readonly visionRadiusForPlayer: (playerId: string) => number;
  readonly getPlayer: (playerId: string) => VisibilitySourcePlayer | undefined;
  // Same as territoryTileKeysForPlayer but excluding FRONTIER tiles — a
  // FRONTIER claim's standing vision is a flat FRONTIER_STANDING_VISION_RADIUS,
  // fixed regardless of the owner's effective vision radius (see
  // tileOwnershipChanged's ownershipState gate below), so it never needs
  // resyncing when tech/domain choices change that effective radius --
  // resyncVisionRadius only touches the subset whose footprint actually
  // varies with it.
  readonly settledTileKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  // The complementary subset — FRONTIER-only tiles. syncAllianceChange needs
  // both subsets, since a new ally must be backfilled at the source's full
  // (tech-scaled) radius over SETTLED tiles but only the flat
  // FRONTIER_STANDING_VISION_RADIUS over FRONTIER ones, matching what
  // tileOwnershipChanged already grants the source itself and its allies
  // going forward.
  readonly frontierTileKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  /** See VisibilityCoverageCache.onFirstSeen (explored-tiles-store.ts). */
  readonly onFirstSeen?: (viewerId: string, tileKey: string) => void;
  /** See VisibilityCoverageCache.onCoverageEdge (Planetary Defense camp awake counts). */
  readonly onCoverageEdge?: (viewerId: string, tileKey: string, entered: boolean) => void;
}

/**
 * Game-domain-aware glue around VisibilityCoverageCache: resolves viewers
 * (self + current allies), tracks the radius last used per source so
 * removals cancel out exactly what was added, and excludes barbarians (never
 * a subscribed gateway client, so a self-viewer entry for them is pure
 * waste on every walk/multiply tick). Takes its players/territory lookups
 * once at construction so call sites stay a single line each. The sole
 * source of truth for territory, ally, town-ring, and structure-bonus vision
 * for both the streaming tile-delta path and the full-export/login path (see
 * runtime-visibility-classifier.ts).
 */
export class VisibilityCoverageTracker {
  private readonly cache: VisibilityCoverageCache;
  private readonly deps: VisibilityCoverageTrackerDeps;
  private readonly radiusBySource = new Map<string, number>();
  // Last-applied town vision bonus radius per (source, tile), so a bonus can
  // be removed exactly — including when the source's base radius changes and
  // the +1 ring must move outward/inward.
  private readonly townBonusRadiusBySourceAndTile = new Map<string, Map<string, number>>();
  // Light/Siege Battery vision bonuses (runtime-outpost-vision.ts) and
  // Observatory's flat local vision bonus (runtime-observatory-vision.ts) —
  // same "flat extra radius around one owned tile" shape as each other, kept
  // in separate SourceBonusRadiusTracker instances (distinct reason tags and
  // independent removal) so one structure type's ring can be removed/re-set
  // without disturbing an unrelated one on a different tile of the same
  // owner. Constructed below, after `cache` is assigned.
  private readonly outpostBonusTracker: SourceBonusRadiusTracker;
  private readonly observatoryBonusTracker: SourceBonusRadiusTracker;

  constructor(worldWidth: number, worldHeight: number, deps: VisibilityCoverageTrackerDeps, footprintTable?: VisionFootprintTable) {
    this.cache = new VisibilityCoverageCache(worldWidth, worldHeight, footprintTable, deps.onFirstSeen, deps.onCoverageEdge);
    this.deps = deps;
    const isBarbarian = (id: string) => this.isBarbarian(id);
    const viewersForSource = (id: string) => this.viewersForSource(id);
    this.outpostBonusTracker = new SourceBonusRadiusTracker(this.cache, "relay-beacon", isBarbarian, viewersForSource, true); // beacons see over forest
    this.observatoryBonusTracker = new SourceBonusRadiusTracker(this.cache, "observatory", isBarbarian, viewersForSource);
  }

  isVisible(viewerId: string, tileKey: string): boolean {
    return this.cache.isVisible(viewerId, tileKey);
  }

  /** Allocation-free pass-through — see VisibilityCoverageCache.forEachVisibleKey. */
  forEachVisibleKey(viewerId: string, cb: (key: string) => void): void {
    this.cache.forEachVisibleKey(viewerId, cb);
  }

  /** Pass-through — see VisibilityCoverageCache.reasonsForTile. */
  reasonsForTile(viewerId: string, tileKey: string): ReadonlySet<string> {
    return this.cache.reasonsForTile(viewerId, tileKey);
  }

  private isBarbarian(playerId: string): boolean {
    return playerId.startsWith("barbarian-");
  }

  /** "radius:self" if `viewerId` IS `sourceId`, else "radius:ally:<sourceId>" — the same self/ally split the old (pre-unification) full-export path derived for free from computing each source's dilation separately. */
  private territoryReason(sourceId: string, viewerId: string): string {
    return viewerId === sourceId ? "radius:self" : `radius:ally:${sourceId}`;
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
   * Call whenever a tile's owner and/or ownershipState changes (or is first
   * assigned at boot): cancels the previous owner's footprint at that cell
   * and applies the new owner's — O(radius²) total, the hot path this class
   * exists to protect.
   *
   * A FRONTIER claim holds only a flat FRONTIER_STANDING_VISION_RADIUS halo
   * (currently 1) instead of the source's full (tech-scaled) vision radius,
   * gated via `options.previousOwnershipState`/`nextOwnershipState` — a
   * fixed constant, not derived from `radiusForSource`, so it never varies
   * with the owner's effective radius. Only a SETTLED tile (or a tile with
   * no explicit ownershipState, e.g. legacy/barbarian data) projects the
   * full radius. This is why callers must pass options whenever
   * ownershipState is known: omitting them (as existing tests that predate
   * this distinction do) preserves the old always-on full-radius behavior.
   */
  tileOwnershipChanged(
    previousOwnerId: string | undefined,
    nextOwnerId: string | undefined,
    x: number,
    y: number,
    callbacks?: VisibilityTransitionCallbacks,
    options?: { previousOwnershipState?: string | undefined; nextOwnershipState?: string | undefined }
  ): void {
    if (previousOwnerId && !this.isBarbarian(previousOwnerId)) {
      const radius = options?.previousOwnershipState === "FRONTIER" ? FRONTIER_STANDING_VISION_RADIUS : this.radiusForSource(previousOwnerId);
      for (const viewerId of this.viewersForSource(previousOwnerId)) {
        this.cache.removeFootprint(viewerId, x, y, radius, callbacks?.onLeave, this.territoryReason(previousOwnerId, viewerId));
      }
    }
    if (nextOwnerId && !this.isBarbarian(nextOwnerId)) {
      const radius = options?.nextOwnershipState === "FRONTIER" ? FRONTIER_STANDING_VISION_RADIUS : this.radiusForSource(nextOwnerId);
      for (const viewerId of this.viewersForSource(nextOwnerId)) {
        this.cache.addFootprint(viewerId, x, y, radius, callbacks?.onEnter, this.territoryReason(nextOwnerId, viewerId));
      }
    }
  }

  /**
   * Call after a tech/domain choice that may have changed a player's
   * effective vision radius. Removes the whole territory's old-radius
   * contribution and re-adds it at the new radius — O(territory × radius²)
   * once, which is fine given tech/domain choices are rare (unlike the O(1)
   * per-tile hot path this class exists to protect).
   */
  resyncVisionRadius(playerId: string, callbacks?: VisibilityTransitionCallbacks): void {
    const newRadius = this.deps.visionRadiusForPlayer(playerId);
    const oldRadius = this.radiusBySource.get(playerId);
    if (oldRadius === newRadius) return;
    const viewers = this.viewersForSource(playerId);
    if (viewers.length > 0) {
      // FRONTIER tiles contribute a fixed FRONTIER_STANDING_VISION_RADIUS
      // footprint that never varies with the owner's tech-scaled radius (see
      // tileOwnershipChanged), so only the settled subset needs resyncing.
      const settledTileKeys = this.deps.settledTileKeysForPlayer(playerId);
      if (oldRadius !== undefined) {
        for (const viewerId of viewers) {
          this.cache.removeSourceContribution(viewerId, settledTileKeys, oldRadius, callbacks?.onLeave, this.territoryReason(playerId, viewerId));
        }
      }
      for (const viewerId of viewers) {
        this.cache.addSourceContribution(viewerId, settledTileKeys, newRadius, callbacks?.onEnter, this.territoryReason(playerId, viewerId));
      }
    }
    this.radiusBySource.set(playerId, newRadius);
  }

  /**
   * Adds a one-off, non-territory vision source for a single viewer (e.g. a
   * watchtower's temporary reveal pulse). Unlike tileOwnershipChanged this is
   * not tracked by radiusBySource — the caller is responsible for calling
   * removeTemporaryReveal with the exact same (x, y, radius) once the effect
   * expires (see runtime.ts's pendingWatchtowerReveals / tickWatchtowerReveals).
   */
  addTemporaryReveal(viewerId: string, x: number, y: number, radius: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(viewerId)) return;
    this.cache.addFootprint(viewerId, x, y, radius, callbacks?.onEnter, "temporary-reveal");
  }

  /** Reverses addTemporaryReveal once the timed effect expires. */
  removeTemporaryReveal(viewerId: string, x: number, y: number, radius: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(viewerId)) return;
    this.cache.removeFootprint(viewerId, x, y, radius, callbacks?.onLeave, "temporary-reveal");
  }

  /**
   * Adds a permanent vision bonus from a specific tile (e.g. a Relay Beacon's
   * +5 vision). Unlike tileOwnershipChanged this does NOT go through
   * radiusBySource — it's a flat extra footprint that stacks on top of the
   * owner's territory-based coverage. Call removeTileVisionBonus with the exact
   * same (x, y, bonusRadius, reason) when the bonus source is removed.
   */
  addTileVisionBonus(
    viewerId: string,
    x: number,
    y: number,
    bonusRadius: number,
    callbacks?: VisibilityTransitionCallbacks,
    reason = "structure-bonus"
  ): void {
    if (this.isBarbarian(viewerId)) return;
    this.cache.addFootprint(viewerId, x, y, bonusRadius, callbacks?.onEnter, reason);
  }

  /** Reverses addTileVisionBonus when the vision-bonus source is removed. */
  removeTileVisionBonus(
    viewerId: string,
    x: number,
    y: number,
    bonusRadius: number,
    callbacks?: VisibilityTransitionCallbacks,
    reason = "structure-bonus"
  ): void {
    if (this.isBarbarian(viewerId)) return;
    this.cache.removeFootprint(viewerId, x, y, bonusRadius, callbacks?.onLeave, reason);
  }

  /**
   * Applies the +1 "own reveal" bonus for an owned SETTLED town: a footprint
   * of the source's base vision radius + 1 centered on the town. Because the
   * town tile already contributes its base-radius footprint via
   * tileOwnershipChanged, this stacked base+1 footprint (a superset) extends
   * the town's own reveal by exactly one ring. Reuses the refcounted coverage
   * cache so streaming tile-deltas stay consistent with the full-export path.
   *
   * Unlike the caller-managed addTileVisionBonus, the applied radius is
   * tracked per (source, tile) so a base-radius change (tech/observatory) can
   * move the +1 ring outward/inward by re-calling with the new radius. Applies
   * to the source and its current allies, mirroring territory-based coverage.
   */
  setTownVisionBonus(sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(sourceId)) return;
    const tileKey = simulationTileKey(x, y);
    const existing = this.townBonusRadiusBySourceAndTile.get(sourceId)?.get(tileKey);
    if (existing === bonusRadius) return;
    for (const viewerId of this.viewersForSource(sourceId)) {
      const reason = this.territoryReason(sourceId, viewerId);
      if (existing !== undefined) this.cache.removeFootprint(viewerId, x, y, existing, callbacks?.onLeave, reason);
      this.cache.addFootprint(viewerId, x, y, bonusRadius, callbacks?.onEnter, reason);
    }
    let byTile = this.townBonusRadiusBySourceAndTile.get(sourceId);
    if (!byTile) {
      byTile = new Map();
      this.townBonusRadiusBySourceAndTile.set(sourceId, byTile);
    }
    byTile.set(tileKey, bonusRadius);
  }

  /** Reverses setTownVisionBonus when a tile stops being an owned town. */
  removeTownVisionBonus(sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(sourceId)) return;
    const tileKey = simulationTileKey(x, y);
    const byTile = this.townBonusRadiusBySourceAndTile.get(sourceId);
    const existing = byTile?.get(tileKey);
    if (existing === undefined) return;
    for (const viewerId of this.viewersForSource(sourceId)) {
      this.cache.removeFootprint(viewerId, x, y, existing, callbacks?.onLeave, this.territoryReason(sourceId, viewerId));
    }
    byTile!.delete(tileKey);
    if (byTile!.size === 0) this.townBonusRadiusBySourceAndTile.delete(sourceId);
  }

  /**
   * Adds a permanent vision bonus for an owned active Relay Beacon or Siege
   * Outpost (runtime-outpost-vision.ts) — Relay Beacon's flat base plus
   * Survey Corps's outpostVisionRadiusBonus tech effect on either. A Light
   * Outpost upgrading to a Siege Battery, or a tech unlock moving the ring,
   * can always be removed/re-set exactly regardless of which structure
   * granted it — see SourceBonusRadiusTracker.
   */
  setOutpostVisionBonus(sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks): void {
    this.outpostBonusTracker.set(sourceId, x, y, bonusRadius, callbacks);
  }

  /** Reverses setOutpostVisionBonus when the outpost is removed/upgraded away. */
  removeOutpostVisionBonus(sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks): void {
    this.outpostBonusTracker.remove(sourceId, x, y, callbacks);
  }

  /**
   * Adds a permanent vision bonus for an owned active Observatory
   * (runtime-observatory-vision.ts) — a flat OBSERVATORY_VISION_BONUS
   * (config.ts). See SourceBonusRadiusTracker.
   */
  setObservatoryVisionBonus(sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks): void {
    this.observatoryBonusTracker.set(sourceId, x, y, bonusRadius, callbacks);
  }

  /** Reverses setObservatoryVisionBonus when the Observatory is removed/disabled. */
  removeObservatoryVisionBonus(sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks): void {
    this.observatoryBonusTracker.remove(sourceId, x, y, callbacks);
  }

  /**
   * Call when two players become or stop being allies. Adds/removes each
   * side's entire current territory footprint to/from the other's coverage —
   * O(territory × radius²) once per alliance change (rare), instead of any
   * per-tile cost on the hot capture/loss path.
   *
   * Split into two contributions per side — SETTLED tiles at the source's
   * full (tech-scaled) radius, FRONTIER tiles at the flat
   * FRONTIER_STANDING_VISION_RADIUS — mirroring the same gate
   * tileOwnershipChanged applies on the hot path. Without this split a new
   * ally would get a full-radius halo around the source's FRONTIER claims
   * that the source itself can't see.
   *
   * Also adds/removes each side's town +1 vision-bonus rings (see
   * setTownVisionBonus), outpost vision-bonus rings (see
   * setOutpostVisionBonus), and Observatory vision-bonus rings (see
   * setObservatoryVisionBonus) to/from the other's coverage. Those rings are
   * stacked on top of the base territory footprint above and are keyed
   * per-source (townBonusRadiusBySourceAndTile, and outpostBonusTracker/
   * observatoryBonusTracker's own SourceBonusRadiusTracker instances),
   * so they don't get swept in by addSourceContribution/removeSourceContribution
   * — without this they'd only reach a new ally once some unrelated tile
   * event happened to touch the town/outpost/observatory.
   */
  syncAllianceChange(actorId: string, targetId: string, allied: boolean, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(actorId) || this.isBarbarian(targetId)) return;
    const actorRadius = this.radiusForSource(actorId);
    const targetRadius = this.radiusForSource(targetId);
    const actorSettled = this.deps.settledTileKeysForPlayer(actorId);
    const targetSettled = this.deps.settledTileKeysForPlayer(targetId);
    const actorFrontier = this.deps.frontierTileKeysForPlayer(actorId);
    const targetFrontier = this.deps.frontierTileKeysForPlayer(targetId);
    if (allied) {
      this.cache.addSourceContribution(targetId, actorSettled, actorRadius, callbacks?.onEnter, `radius:ally:${actorId}`);
      this.cache.addSourceContribution(targetId, actorFrontier, FRONTIER_STANDING_VISION_RADIUS, callbacks?.onEnter, `radius:ally:${actorId}`);
      this.cache.addSourceContribution(actorId, targetSettled, targetRadius, callbacks?.onEnter, `radius:ally:${targetId}`);
      this.cache.addSourceContribution(actorId, targetFrontier, FRONTIER_STANDING_VISION_RADIUS, callbacks?.onEnter, `radius:ally:${targetId}`);
      this.applyTownBonusesToViewer(actorId, targetId, callbacks?.onEnter);
      this.applyTownBonusesToViewer(targetId, actorId, callbacks?.onEnter);
      this.outpostBonusTracker.applyToViewer(actorId, targetId, callbacks?.onEnter);
      this.outpostBonusTracker.applyToViewer(targetId, actorId, callbacks?.onEnter);
      this.observatoryBonusTracker.applyToViewer(actorId, targetId, callbacks?.onEnter);
      this.observatoryBonusTracker.applyToViewer(targetId, actorId, callbacks?.onEnter);
    } else {
      this.cache.removeSourceContribution(targetId, actorSettled, actorRadius, callbacks?.onLeave, `radius:ally:${actorId}`);
      this.cache.removeSourceContribution(targetId, actorFrontier, FRONTIER_STANDING_VISION_RADIUS, callbacks?.onLeave, `radius:ally:${actorId}`);
      this.cache.removeSourceContribution(actorId, targetSettled, targetRadius, callbacks?.onLeave, `radius:ally:${targetId}`);
      this.cache.removeSourceContribution(actorId, targetFrontier, FRONTIER_STANDING_VISION_RADIUS, callbacks?.onLeave, `radius:ally:${targetId}`);
      this.applyTownBonusesToViewer(actorId, targetId, undefined, callbacks?.onLeave);
      this.applyTownBonusesToViewer(targetId, actorId, undefined, callbacks?.onLeave);
      this.outpostBonusTracker.applyToViewer(actorId, targetId, undefined, callbacks?.onLeave);
      this.outpostBonusTracker.applyToViewer(targetId, actorId, undefined, callbacks?.onLeave);
      this.observatoryBonusTracker.applyToViewer(actorId, targetId, undefined, callbacks?.onLeave);
      this.observatoryBonusTracker.applyToViewer(targetId, actorId, undefined, callbacks?.onLeave);
    }
  }

  /**
   * Adds (onEnter set) or removes (onLeave set) every currently-tracked town
   * vision-bonus footprint of `sourceId` to/from `viewerId`'s coverage. Used
   * by syncAllianceChange to keep a source's town rings in sync with its
   * current ally set, mirroring what setTownVisionBonus/removeTownVisionBonus
   * already do for viewersForSource(sourceId) on every town add/remove/resync.
   */
  private applyTownBonusesToViewer(
    sourceId: string,
    viewerId: string,
    onEnter?: (viewerId: string, tileKey: string) => void,
    onLeave?: (viewerId: string, tileKey: string) => void
  ): void {
    const byTile = this.townBonusRadiusBySourceAndTile.get(sourceId);
    if (!byTile) return;
    const reason = `radius:ally:${sourceId}`;
    for (const [tileKey, radius] of byTile) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      if (onEnter) this.cache.addFootprint(viewerId, parsed.x, parsed.y, radius, onEnter, reason);
      if (onLeave) this.cache.removeFootprint(viewerId, parsed.x, parsed.y, radius, onLeave, reason);
    }
  }

}
