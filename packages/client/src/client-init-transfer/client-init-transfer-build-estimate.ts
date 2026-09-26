// How long this device takes to build the map from a downloaded INIT, per
// KB, learned from previous logins. Used for the login overlay's "time left"
// estimate, since the build blocks the main thread and can't report progress.

const STORAGE_KEY = "be-init-build-ms-per-kb";
/** Used until this device has a measurement; errs slow (mid-range phone). */
export const DEFAULT_INIT_BUILD_MS_PER_KB = 6;
const MIN_MS_PER_KB = 0.2;
const MAX_MS_PER_KB = 100;
const MIN_BUILD_ESTIMATE_MS = 1_000;

const clampMsPerKb = (value: number): number => Math.min(MAX_MS_PER_KB, Math.max(MIN_MS_PER_KB, value));

export const readInitBuildMsPerKb = (): number => {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampMsPerKb(stored) : DEFAULT_INIT_BUILD_MS_PER_KB;
  } catch {
    return DEFAULT_INIT_BUILD_MS_PER_KB;
  }
};

export const estimateInitBuildMs = (totalChars: number, msPerKb = readInitBuildMsPerKb()): number =>
  Math.max(MIN_BUILD_ESTIMATE_MS, Math.round((totalChars / 1024) * msPerKb));

/** Blends a new measurement into the stored rate so one slow login doesn't dominate. */
export const recordInitBuildDuration = (totalChars: number, durationMs: number): void => {
  const kb = totalChars / 1024;
  if (kb < 1 || !Number.isFinite(durationMs) || durationMs <= 0) return;
  const measured = clampMsPerKb(durationMs / kb);
  let previous: number | undefined;
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    previous = Number.isFinite(stored) && stored > 0 ? stored : undefined;
  } catch {
    previous = undefined;
  }
  const blended = previous === undefined ? measured : clampMsPerKb(previous * 0.5 + measured * 0.5);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, blended.toFixed(3));
  } catch {
    // Storage blocked (Safari private mode etc.): keep using the default.
  }
};
