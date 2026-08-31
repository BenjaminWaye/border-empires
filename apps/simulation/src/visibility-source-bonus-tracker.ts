/**
 * Generic per-(source, tile) permanent vision-bonus tracker, shared by
 * VisibilityCoverageTracker's structure-vision-bonus features (Relay
 * Beacon/Siege Outpost — runtime-outpost-vision.ts — and Observatory —
 * runtime-observatory-vision.ts). Both features are "a flat extra radius
 * around one specific owned tile, tagged with a fixed reason string, that
 * needs to be removed/re-set exactly (including when a tech unlock moves the
 * radius) and mirrored into a new ally's coverage on SYNC_ALLIANCE" — this
 * class holds that shape once instead of duplicating it per feature.
 */

import type { VisibilityCoverageCache, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const separator = tileKey.indexOf(",");
  if (separator < 0) return undefined;
  const x = Number(tileKey.slice(0, separator));
  const y = Number(tileKey.slice(separator + 1));
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
};

export class SourceBonusRadiusTracker {
  private readonly radiusBySourceAndTile = new Map<string, Map<string, number>>();

  constructor(
    private readonly cache: VisibilityCoverageCache,
    private readonly reason: string,
    private readonly isBarbarian: (sourceId: string) => boolean,
    private readonly viewersForSource: (sourceId: string) => Iterable<string>
  ) {}

  set(sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(sourceId)) return;
    const tileKey = simulationTileKey(x, y);
    const existing = this.radiusBySourceAndTile.get(sourceId)?.get(tileKey);
    if (existing === bonusRadius) return;
    for (const viewerId of this.viewersForSource(sourceId)) {
      if (existing !== undefined) this.cache.removeFootprint(viewerId, x, y, existing, callbacks?.onLeave, this.reason);
      this.cache.addFootprint(viewerId, x, y, bonusRadius, callbacks?.onEnter, this.reason);
    }
    let byTile = this.radiusBySourceAndTile.get(sourceId);
    if (!byTile) {
      byTile = new Map();
      this.radiusBySourceAndTile.set(sourceId, byTile);
    }
    byTile.set(tileKey, bonusRadius);
  }

  remove(sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks): void {
    if (this.isBarbarian(sourceId)) return;
    const tileKey = simulationTileKey(x, y);
    const byTile = this.radiusBySourceAndTile.get(sourceId);
    const existing = byTile?.get(tileKey);
    if (existing === undefined) return;
    for (const viewerId of this.viewersForSource(sourceId)) {
      this.cache.removeFootprint(viewerId, x, y, existing, callbacks?.onLeave, this.reason);
    }
    byTile!.delete(tileKey);
    if (byTile!.size === 0) this.radiusBySourceAndTile.delete(sourceId);
  }

  /**
   * Adds (onEnter set) or removes (onLeave set) every currently-tracked
   * bonus footprint of `sourceId` to/from `viewerId`'s coverage — used by
   * syncAllianceChange to keep a source's rings in sync with its current
   * ally set.
   */
  applyToViewer(
    sourceId: string,
    viewerId: string,
    onEnter?: (viewerId: string, tileKey: string) => void,
    onLeave?: (viewerId: string, tileKey: string) => void
  ): void {
    const byTile = this.radiusBySourceAndTile.get(sourceId);
    if (!byTile) return;
    for (const [tileKey, radius] of byTile) {
      const parsed = parseTileKey(tileKey);
      if (!parsed) continue;
      if (onEnter) this.cache.addFootprint(viewerId, parsed.x, parsed.y, radius, onEnter, this.reason);
      if (onLeave) this.cache.removeFootprint(viewerId, parsed.x, parsed.y, radius, onLeave, this.reason);
    }
  }
}
