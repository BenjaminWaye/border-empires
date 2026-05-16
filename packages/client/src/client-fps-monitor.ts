const FRAME_WINDOW_MS = 1000;
const MAX_FRAMES = 240;

const frameTimestamps: number[] = [];
let lowFpsStreakStart = 0;

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
};
