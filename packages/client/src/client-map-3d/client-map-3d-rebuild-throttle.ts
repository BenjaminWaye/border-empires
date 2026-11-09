// Throttle for client-map-3d.ts's rebuildVisibleTerrain().
//
// terrainWindowCovers's padded hysteresis (client-map-3d-terrain-window.ts)
// suppresses most rebuilds during a pan or zoom, but near MIN_ZOOM the tile
// budget leaves no pad at all, so a continuous pan requests a rebuild on
// nearly every frame. A fixed 48ms floor was the only backstop, and a full
// rebuild of a zoomed-out window costs ~300ms of synchronous main-thread work
// on a mid-range laptop: a staging trace of a zoomed-out pan spent 6.3s of
// 12.9s (49%) inside 21 back-to-back rebuilds, every one of them a 120-590ms
// long task, so the map ran at a few frames per second while dragging.
//
// So the floor now scales with what the last rebuild actually cost: the next
// rebuild may start only once the main thread has had REBUILD_IDLE_FACTOR x
// that cost to itself for input, camera and the per-frame overlays. A cheap
// rebuild (high zoom, fast device) keeps the old 48ms floor; an expensive one
// is held off longer, capped at REBUILD_MAX_INTERVAL_MS so the newly uncovered
// edge of a zoomed-out pan never stays unpopulated for more than about a second.
//
// Not a dropped-update risk: maybeRebuild keeps reporting rebuildNeeded on
// every frame until the floor opens (the throttle only advances on an actual
// rebuild), so the frame after motion settles always rebuilds against the
// current state.

export const REBUILD_MIN_INTERVAL_MS = 48;
export const REBUILD_MAX_INTERVAL_MS = 1_000;
// Main-thread time handed back to everything else per ms of rebuild: 2 caps
// rebuilds at ~1/3 of the main thread during continuous camera motion.
export const REBUILD_IDLE_FACTOR = 2;

/** Start-to-start interval required after a rebuild that took `lastCostMs`. */
export const rebuildIntervalMs = (lastCostMs: number): number => {
  const cost = Number.isFinite(lastCostMs) && lastCostMs > 0 ? lastCostMs : 0;
  return Math.min(REBUILD_MAX_INTERVAL_MS, Math.max(REBUILD_MIN_INTERVAL_MS, cost * (1 + REBUILD_IDLE_FACTOR)));
};

export type RebuildThrottle = {
  /** True when no rebuild has committed yet, or the cost-scaled floor has passed. */
  readonly ready: (nowMs: number) => boolean;
  /** Records a committed rebuild that started at `startMs` and ended at `endMs` (performance.now()). */
  readonly record: (startMs: number, endMs: number) => void;
};

export const createRebuildThrottle = (): RebuildThrottle => {
  let lastStartMs: number | undefined;
  let lastCostMs = 0;
  return {
    ready: (nowMs) => lastStartMs === undefined || nowMs - lastStartMs >= rebuildIntervalMs(lastCostMs),
    record: (startMs, endMs) => {
      lastStartMs = startMs;
      lastCostMs = Math.max(0, endMs - startMs);
    }
  };
};
