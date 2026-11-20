/**
 * The refcounted per-viewer coverage raster behind VisibilityCoverageTracker
 * (visibility-coverage-cache.ts), split out of that file to keep it under the
 * repo's 500-line cap. See the tracker file's header for the model.
 */

import { simulationTileKey } from "./seed-state/seed-state.js";
import type { VisionFootprintTable } from "./vision-footprint-table.js";
import { addReasonCount, removeReasonCount, type VisibilityReasonCounts } from "./visibility-reason-counts.js";
import { parseVisibilityTileKey as parseTileKey } from "./visibility-tile-key.js";
import { VisibilityFootprintLedger, type FootprintOffsets } from "./visibility-footprint-ledger.js";

const EMPTY_REASONS: ReadonlySet<string> = new Set();

export class VisibilityCoverageCache {
  private readonly coverage = new Map<string, Map<string, number>>();
  // viewerId -> tileKey -> reason -> refcount. Populated in lockstep with
  // `coverage` whenever a caller supplies a `reason` tag (e.g. "radius:self",
  // "radius:ally:<id>", "relay-beacon", "temporary-reveal" — see
  // VisibilityCoverageTracker for the vocabulary), so the full-export
  // visibility audit (runtime-visible-state.ts) can explain *why* a tile is
  // visible without recomputing anything from scratch. Refcounted the same
  // way `coverage` is: a cell can be reached by the same reason from two
  // different sources (e.g. two owned tiles both dilating into it), and the
  // tag must survive until every such contribution is withdrawn.
  private readonly reasons: VisibilityReasonCounts = new Map();
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly footprintTable: VisionFootprintTable | undefined;
  // Fires on every 0→1 edge whether or not the call passed `onEnter` (seeding and restore omit it): feeds explored-tile memory.
  private readonly onFirstSeen: ((viewerId: string, tileKey: string) => void) | undefined;
  // Fires on every 0→1 (entered) and 1→0 (left) edge, whatever the call: the
  // only two places a cell's coverage crosses zero. Feeds the Planetary
  // Defense camp awake counts (planetary-defense-camps/camp-awake-tracker.ts).
  private readonly onCoverageEdge: ((viewerId: string, tileKey: string, entered: boolean) => void) | undefined;
  // The exact cells each terrain-dependent contribution added (visibility-footprint-ledger.ts).
  private readonly ledger = new VisibilityFootprintLedger();

  constructor(
    worldWidth: number,
    worldHeight: number,
    footprintTable?: VisionFootprintTable,
    onFirstSeen?: (viewerId: string, tileKey: string) => void,
    onCoverageEdge?: (viewerId: string, tileKey: string, entered: boolean) => void
  ) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.footprintTable = footprintTable;
    this.onFirstSeen = onFirstSeen;
    this.onCoverageEdge = onCoverageEdge;
  }

  isVisible(viewerId: string, tileKey: string): boolean {
    return (this.coverage.get(viewerId)?.get(tileKey) ?? 0) > 0;
  }

  /** Debug/test only — not on the hot path (allocates a new Set). */
  visibleKeysForViewer(viewerId: string): ReadonlySet<string> {
    return new Set(this.coverage.get(viewerId)?.keys() ?? []);
  }

  /**
   * Allocation-free variant of visibleKeysForViewer for hot-path callers
   * (e.g. merging structure-bonus coverage into a full visibility export) —
   * iterates the viewer's existing coverage map directly instead of copying
   * it into a new Set.
   */
  forEachVisibleKey(viewerId: string, cb: (key: string) => void): void {
    const map = this.coverage.get(viewerId);
    if (!map) return;
    for (const key of map.keys()) cb(key);
  }

  /**
   * Every reason tag currently contributing to `tileKey`'s visibility for
   * `viewerId` (empty if the tile isn't covered, or was covered without a
   * reason tag). Not on the hot path — only called for the audit's rare
   * "tile owned by someone else, currently visible" case.
   */
  reasonsForTile(viewerId: string, tileKey: string): ReadonlySet<string> {
    const byReason = this.reasons.get(viewerId)?.get(tileKey);
    return byReason ? new Set(byReason.keys()) : EMPTY_REASONS;
  }

  /**
   * `onEnter`, if supplied, fires exactly once per cell whose refcount
   * crosses 0→1 for this viewer (a genuine "this tile just entered vision"
   * edge, not every refcount increment). Kept allocation-free on the hot
   * O(radius²) path — no per-cell closures beyond the one passed in.
   * `ignoreForest` (outpost rings) skips forest occlusion; pass the same value to the
   * matching remove. The cells added are recorded, so the remove subtracts the
   * same cells even if terrain in range changed in between.
   */
  addFootprint(
    viewerId: string,
    x: number,
    y: number,
    radius: number,
    onEnter?: (viewerId: string, tileKey: string) => void,
    reason?: string,
    ignoreForest = false
  ): void {
    const map = this.mapFor(viewerId);
    const offsets = this.footprintTable?.getOffsets(x, y, radius, ignoreForest);
    if (offsets) this.ledger.record(viewerId, VisibilityFootprintLedger.keyFor(x, y, radius, ignoreForest), offsets);
    this.forEachDilatedCell(x, y, radius, offsets, (key) => {
      const next = (map.get(key) ?? 0) + 1;
      map.set(key, next);
      if (reason) addReasonCount(this.reasons, viewerId, key, reason);
      if (next !== 1) return;
      this.onFirstSeen?.(viewerId, key);
      this.onCoverageEdge?.(viewerId, key, true);
      onEnter?.(viewerId, key);
    });
  }

  /**
   * `onLeave`, if supplied, fires exactly once per cell whose refcount
   * crosses 1→0 for this viewer (a genuine "this tile just left vision"
   * edge).
   */
  removeFootprint(
    viewerId: string,
    x: number,
    y: number,
    radius: number,
    onLeave?: (viewerId: string, tileKey: string) => void,
    reason?: string,
    ignoreForest = false
  ): void {
    const map = this.coverage.get(viewerId);
    if (!map) return;
    const offsets = this.footprintTable
      ? this.ledger.take(viewerId, VisibilityFootprintLedger.keyFor(x, y, radius, ignoreForest)) ?? this.footprintTable.getOffsets(x, y, radius, ignoreForest)
      : undefined;
    this.forEachDilatedCell(x, y, radius, offsets, (key) => {
      if (reason) removeReasonCount(this.reasons, viewerId, key, reason);
      const next = (map.get(key) ?? 0) - 1;
      if (next <= 0) {
        map.delete(key);
        this.onCoverageEdge?.(viewerId, key, false);
        if (onLeave) onLeave(viewerId, key);
      } else {
        map.set(key, next);
      }
    });
    if (map.size === 0) this.coverage.delete(viewerId);
  }

  /** Bulk add — used for alliance formation and vision-radius resync. */
  addSourceContribution(
    viewerId: string,
    territoryTileKeys: Iterable<string>,
    radius: number,
    onEnter?: (viewerId: string, tileKey: string) => void,
    reason?: string
  ): void {
    for (const tileKey of territoryTileKeys) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      this.addFootprint(viewerId, parsed.x, parsed.y, radius, onEnter, reason);
    }
  }

  /** Bulk remove — used for alliance breakage and vision-radius resync. */
  removeSourceContribution(
    viewerId: string,
    territoryTileKeys: Iterable<string>,
    radius: number,
    onLeave?: (viewerId: string, tileKey: string) => void,
    reason?: string
  ): void {
    for (const tileKey of territoryTileKeys) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      this.removeFootprint(viewerId, parsed.x, parsed.y, radius, onLeave, reason);
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

  /** Live terrain-dependent contributions recorded in the footprint ledger (gauge). */
  footprintLedgerSize(): number {
    return this.ledger.size();
  }

  /** `offsets` from the footprint table, or the plain (2r+1)² square when there is no table. */
  private forEachDilatedCell(x: number, y: number, radius: number, offsets: FootprintOffsets | undefined, cb: (key: string) => void): void {
    const W = this.worldWidth;
    const H = this.worldHeight;
    if (offsets) {
      for (const [dx, dy] of offsets) {
        const nx = ((x + dx) % W + W) % W;
        const ny = ((y + dy) % H + H) % H;
        cb(simulationTileKey(nx, ny));
      }
      return;
    }
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = ((x + dx) % W + W) % W;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = ((y + dy) % H + H) % H;
        cb(simulationTileKey(nx, ny));
      }
    }
  }
}
