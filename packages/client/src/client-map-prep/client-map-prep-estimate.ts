import type { MapPrepStage } from "./client-map-prep-stages.js";

// Per-stage durations learned on this device, for the login overlay's "time
// left". Each stage blocks the main thread, so it can't report progress of
// its own; the estimate is what makes the wait legible.

const STORAGE_KEY = "be-map-prep-stage-ms";
/** First-login guesses for a mid-range phone; replaced by measurements after one login. */
export const DEFAULT_STAGE_MS: Readonly<Record<MapPrepStage, number>> = {
  graphics: 1_500,
  terrain: 1_500,
  structures: 2_500,
  shaders: 2_000,
  firstFrame: 3_000
};
const MAX_STAGE_MS = 120_000;

type StageMs = Record<MapPrepStage, number>;

const isValidMs = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_STAGE_MS;

const readMeasured = (): Partial<StageMs> => {
  const measured: Partial<StageMs> = {};
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return measured;
    const parsed = JSON.parse(raw) as Partial<Record<MapPrepStage, unknown>>;
    for (const stage of Object.keys(DEFAULT_STAGE_MS) as MapPrepStage[]) {
      const value = parsed[stage];
      if (isValidMs(value)) measured[stage] = value;
    }
  } catch {
    // Blocked or corrupt storage: nothing measured.
  }
  return measured;
};

/** This device's measured stage durations, with defaults for stages not yet measured. */
export const readStageEstimates = (): StageMs => ({ ...DEFAULT_STAGE_MS, ...readMeasured() });

/** Blends a measured stage duration into the stored one (half old, half new); only measurements are stored. */
export const recordStageDuration = (stage: MapPrepStage, durationMs: number): void => {
  if (!isValidMs(durationMs)) return;
  const measured = readMeasured();
  const previous = measured[stage];
  measured[stage] = Math.round(previous === undefined ? durationMs : previous * 0.5 + durationMs * 0.5);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(measured));
  } catch {
    // Storage blocked: keep using defaults.
  }
};

/** Estimated total time of the staged 3D map build on this device. */
export const estimateMapPrepMs = (): number => Object.values(readStageEstimates()).reduce((sum, ms) => sum + ms, 0);
