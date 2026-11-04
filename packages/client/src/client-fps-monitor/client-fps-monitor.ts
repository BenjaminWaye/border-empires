const FRAME_WINDOW_MS = 1000;
const MAX_FRAMES = 240;

// A gap this long between animation frames means the page was backgrounded
// (or the main thread was frozen by a resume/re-init burst). The frames right
// after that are catch-up work, not a measure of how well the device renders.
const RESUME_FRAME_GAP_MS = 1000;
/** How long low-fps readings are ignored after a resume or a fresh (re)init. */
export const LOW_FPS_WARMUP_MS = 20_000;

const frameTimestamps: number[] = [];
let lowFpsStreakStart = 0;
let lastFrameAt: number | undefined;
let lowFpsHeldUntil = 0;

/** Ignore low-fps readings (and drop any running streak) until `untilMs`. */
export const holdLowFpsStreakUntil = (untilMs: number): void => {
  lowFpsHeldUntil = Math.max(lowFpsHeldUntil, untilMs);
  lowFpsStreakStart = 0;
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
  if (lastFrameAt !== undefined && nowMs - lastFrameAt >= RESUME_FRAME_GAP_MS) holdLowFpsStreakUntil(nowMs + LOW_FPS_WARMUP_MS);
  lastFrameAt = nowMs;
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
  lastFrameAt = undefined;
  lowFpsHeldUntil = 0;
};
