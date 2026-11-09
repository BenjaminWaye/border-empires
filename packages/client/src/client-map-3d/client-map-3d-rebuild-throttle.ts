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
// The floor scales with the last rebuild's synchronous preparation cost.
// Buffer uploads happen later in renderer.render() and are outside this
// measurement. A cheap rebuild keeps the old 48ms floor; an expensive one
// waits longer, up to a second between rebuild starts. If the camera moves
// outside the built terrain entirely, the old floor lets the destination
// populate sooner.
//
// Not a dropped-update risk: maybeRebuild keeps reporting rebuildNeeded on
// every frame until the floor opens, so the next rebuild uses the current
// state even if the camera has stopped moving.

export const REBUILD_MIN_INTERVAL_MS = 48;
export const REBUILD_MAX_INTERVAL_MS = 1_000;
// Main-thread time handed back to everything else per ms of rebuild: 2 caps
// measured preparation at ~1/3 of the main thread below the interval cap.
export const REBUILD_IDLE_FACTOR = 2;

/** Start-to-start interval required after a rebuild that took `lastCostMs`. */
export const rebuildIntervalMs = (lastCostMs: number): number => {
  const cost = Number.isFinite(lastCostMs) && lastCostMs > 0 ? lastCostMs : 0;
  return Math.min(REBUILD_MAX_INTERVAL_MS, Math.max(REBUILD_MIN_INTERVAL_MS, cost * (1 + REBUILD_IDLE_FACTOR)));
};

export type RebuildThrottle = {
  /** Use the short floor if the camera center has left the built terrain. */
  readonly ready: (nowMs: number, cameraOutsideTerrain?: boolean) => boolean;
  /** Records a committed rebuild that started at `startMs` and ended at `endMs` (performance.now()). */
  readonly record: (startMs: number, endMs: number) => void;
};

export const createRebuildThrottle = (): RebuildThrottle => {
  let lastStartMs: number | undefined;
  let lastCostMs = 0;
  return {
    ready: (nowMs, cameraOutsideTerrain) => {
      const intervalMs = cameraOutsideTerrain ? REBUILD_MIN_INTERVAL_MS : rebuildIntervalMs(lastCostMs);
      return lastStartMs === undefined || nowMs - lastStartMs >= intervalMs;
    },
    record: (startMs, endMs) => {
      lastStartMs = startMs;
      lastCostMs = Math.max(0, endMs - startMs);
    }
  };
};
