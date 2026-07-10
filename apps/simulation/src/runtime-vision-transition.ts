import type { VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

/**
 * Accumulates per-viewer tile-vision enter/leave edges (refcount 0↔1
 * transitions from VisibilityCoverageCache) across a window of runtime
 * mutations, so the FOG-of-war delta emission logic can know — for each
 * subscribed player — exactly which tiles left their vision "this tick"
 * (used to stamp a FOG delta) and which entered (used to stamp a VISIBLE
 * delta). See visibility-coverage-cache.ts for the underlying refcount
 * mechanism this rides on.
 *
 * Session-scoped, in-memory only — cleared via `take()` once per emitted
 * TILE_DELTA_BATCH event (see runtime.ts's emitEvent and
 * simulation-service.ts's fanout loop). Not persisted; fog memory itself
 * lives client-side only (see client-changelog entry for this feature).
 */
export class VisionTransitionAccumulator {
  private entered = new Map<string, Set<string>>();
  private left = new Map<string, Set<string>>();

  readonly callbacks: VisibilityTransitionCallbacks = {
    // A tile can get both edges in the same window -- most notably
    // resyncVisionRadius (tech/domain pick changing vision radius) calls
    // onLeave for a player's whole OLD-radius territory then onEnter for
    // their whole NEW-radius territory, synchronously. Since the radii
    // overlap almost entirely, nearly every owned tile gets both calls even
    // though it was visible the whole time. Tracking enter/leave as
    // independent sets left those tiles wrongly classified as "left vision"
    // (see tile-delta-visibility-stamp.ts, which stamps any leftVisionTileKeys
    // member as FOG with no entered-set check) -- fog-freezing a player's
    // entire territory right after any vision-radius-changing pick.
    // Cancelling a same-tick opposite edge here, order-independent, makes
    // the net-zero case structurally impossible instead of relying on every
    // downstream consumer to reconcile the two sets itself.
    onEnter: (viewerId, tileKey) => this.recordEdge(this.entered, this.left, viewerId, tileKey),
    onLeave: (viewerId, tileKey) => this.recordEdge(this.left, this.entered, viewerId, tileKey)
  };

  private recordEdge(target: Map<string, Set<string>>, opposite: Map<string, Set<string>>, viewerId: string, tileKey: string): void {
    const oppositeSet = opposite.get(viewerId);
    if (oppositeSet?.delete(tileKey)) return;
    let set = target.get(viewerId);
    if (!set) {
      set = new Set();
      target.set(viewerId, set);
    }
    set.add(tileKey);
  }

  /** Snapshot-and-clear: returns everything accumulated since the last call. */
  take(): { entered: ReadonlyMap<string, ReadonlySet<string>>; left: ReadonlyMap<string, ReadonlySet<string>> } {
    const result = { entered: this.entered, left: this.left };
    this.entered = new Map();
    this.left = new Map();
    return result;
  }
}
