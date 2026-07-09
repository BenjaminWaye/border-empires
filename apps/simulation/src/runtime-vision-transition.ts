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
    onEnter: (viewerId, tileKey) => this.record(this.entered, viewerId, tileKey),
    onLeave: (viewerId, tileKey) => this.record(this.left, viewerId, tileKey)
  };

  private record(target: Map<string, Set<string>>, viewerId: string, tileKey: string): void {
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
