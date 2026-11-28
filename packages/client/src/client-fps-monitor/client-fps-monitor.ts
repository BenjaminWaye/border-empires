const FRAME_WINDOW_MS = 1000;
const MAX_FRAMES = 240;

/**
 * How long low-fps readings are ignored after the page comes back to the
 * foreground or the world state is (re)loaded. Both trigger seconds of
 * main-thread catch-up work that tanks the frame rate even on flagship
 * phones; that is not a measure of how well the device renders 3D.
 * Driven by explicit events (not frame gaps), so a device that is simply too
 * slow -- even one stalling for whole seconds -- still accumulates a streak.
 */
export const LOW_FPS_WARMUP_MS = 20_000;

const frameTimestamps: number[] = [];
let lowFpsStreakStart = 0;
let lowFpsHeldUntil = 0;
let visibilityListenerInstalled = false;

/** Ignore low-fps readings (and drop any running streak) for LOW_FPS_WARMUP_MS from `nowMs`. */
export const holdLowFpsStreakForWarmup = (nowMs: number): void => {
  lowFpsHeldUntil = Math.max(lowFpsHeldUntil, nowMs + LOW_FPS_WARMUP_MS);
  lowFpsStreakStart = 0;
};

/** Page visibility hook: returning to the foreground starts a warm-up hold. */
export const noteFpsMonitorVisibility = (visible: boolean, nowMs: number): void => {
  if (visible) holdLowFpsStreakForWarmup(nowMs);
};

const ensureVisibilityListener = (): void => {
  if (visibilityListenerInstalled || typeof document === "undefined") return;
  visibilityListenerInstalled = true;
  document.addEventListener("visibilitychange", () =>
    noteFpsMonitorVisibility(document.visibilityState === "visible", performance.now())
  );
};

const trimWindow = (nowMs: number): void => {
  const cutoff = nowMs - FRAME_WINDOW_MS;
  while (frameTimestamps.length > 0) {
    const head = frameTimestamps[0];
    if (head === undefined || head >= cutoff) break;
    frameTimestamps.shift();
  }
  if (frameTimestamps.length > MAX_FRAMES) frameTimestamps.splice(0, frameTimestamps.length - MAX_FRAMES);
};

export const recordFrame = (nowMs: number): void => {
  ensureVisibilityListener();
  frameTimestamps.push(nowMs);
  trimWindow(nowMs);
};

export const getCurrentFps = (): number | undefined => {
  if (frameTimestamps.length < 2) return undefined;
  const first = frameTimestamps[0];
  const last = frameTimestamps[frameTimestamps.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const span = last - first;
  if (span <= 0) return undefined;
  return ((frameTimestamps.length - 1) * 1000) / span;
};

// Returns ms that current FPS has been continuously at or below `threshold`. 0 if not currently below.
export const getSustainedLowFpsDurationMs = (threshold: number, nowMs: number): number => {
  if (nowMs < lowFpsHeldUntil) {
    lowFpsStreakStart = 0;
    return 0;
  }
  const fps = getCurrentFps();
  if (fps === undefined || fps > threshold) {
    lowFpsStreakStart = 0;
    return 0;
  }
  if (lowFpsStreakStart === 0) lowFpsStreakStart = nowMs;
  return nowMs - lowFpsStreakStart;
};

export const hasSustainedLowFps = (threshold: number, requiredMs: number, nowMs: number): boolean =>
  getSustainedLowFpsDurationMs(threshold, nowMs) >= requiredMs;

export const resetFpsMonitorForTests = (): void => {
  frameTimestamps.length = 0;
  lowFpsStreakStart = 0;
  lowFpsHeldUntil = 0;
};
