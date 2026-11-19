import type { Tile } from "../client-types.js";

// Holo-Locked Stack waystation: the moment a rig is collected. The server
// clears an activated waystation from the map, so the client keeps a short,
// renderer-agnostic record of each opening and both renderers play the same
// short timeline from it (the cache leaves as soon as it is open):
//   0     - 500 ms  the hologram padlock unlatches and dissolves
//   300   - 1100 ms the front crate's door hinges down like a ramp
//   400   - 1500 ms the reward core rises out of the crate
//   1600  - 2600 ms teleport-out shimmer, then the site is gone.
// The collector's reward card covers the map the moment the rig is collected,
// so an opening is held at its first frame (lock intact, crates closed) until
// the map is clear, then its clock starts: startedAt is unset while held and
// wall-clock (Date.now() ms) once running. True-3D drains the queue into an
// anchored fx layer that keeps the entry; 2D reads waystationOpenFxByKey.

export const WAYSTATION_OPEN_LOCK_MS = 500;
export const WAYSTATION_OPEN_DOOR_START_MS = 300;
export const WAYSTATION_OPEN_DOOR_MS = 800;
export const WAYSTATION_OPEN_CORE_START_MS = 400;
export const WAYSTATION_OPEN_CORE_MS = 1100;
export const WAYSTATION_OPEN_FADE_START_MS = 1600;
export const WAYSTATION_OPEN_TOTAL_MS = 2600;
/** Hard bound on concurrent openings: they are short-lived, but never let a burst grow the store. */
export const WAYSTATION_OPEN_FX_MAX = 24;
/** An opening still held this long after detection (a reward card never closed) is dropped. */
export const WAYSTATION_OPEN_HOLD_MAX_MS = 5 * 60_000;

export type WaystationOpenFxEntry = { x: number; y: number; detectedAt: number; startedAt?: number };

/** Starts a held opening's clock once `covered()` says the map is visible; true while it is running. */
export const beginWaystationOpening = (entry: WaystationOpenFxEntry, nowEpochMs: number, covered: () => boolean): boolean => {
  if (entry.startedAt === undefined && !covered()) entry.startedAt = nowEpochMs;
  return entry.startedAt !== undefined;
};

/** Milliseconds into the timeline (0 while held), or undefined once finished or held too long. */
export const waystationOpeningAge = (entry: WaystationOpenFxEntry, nowEpochMs: number): number | undefined => {
  if (entry.startedAt === undefined) return nowEpochMs - entry.detectedAt >= WAYSTATION_OPEN_HOLD_MAX_MS ? undefined : 0;
  const age = nowEpochMs - entry.startedAt;
  return age >= WAYSTATION_OPEN_TOTAL_MS ? undefined : Math.max(0, age);
};

export type WaystationOpenFxState = {
  waystationOpenFxQueue: WaystationOpenFxEntry[];
  waystationOpenFxByKey: Map<string, WaystationOpenFxEntry>;
};

export const createInitialWaystationOpenFxState = (): WaystationOpenFxState => ({
  waystationOpenFxQueue: [],
  waystationOpenFxByKey: new Map()
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeOutCubic = (p: number): number => 1 - Math.pow(1 - clamp01(p), 3);
/** Ease with a small overshoot: the door slams past flat and settles. */
const backOut = (p: number): number => {
  const q = clamp01(p) - 1;
  return 1 + 2.4 * q * q * q + 1.4 * q * q;
};

/** Every animated quantity of an opening at `ageMs`, shared by both renderers. */
export type WaystationOpenPose = {
  /** 0 intact padlock .. 1 fully dissolved. */
  readonly lock: number;
  /** 0 closed .. ~1.08 (overshoot) door folded down flat. */
  readonly door: number;
  /** 0 inside the crate .. 1 hovering above the open door. */
  readonly core: number;
  /** Interior light, 0..1, with a burst as the door opens. */
  readonly glow: number;
  /** 0 until the teleport-out starts .. 1 gone. */
  readonly out: number;
  /** Overall visibility of the site, 1 .. 0 during the teleport-out. */
  readonly alpha: number;
  readonly done: boolean;
};

export const waystationOpenPose = (ageMs: number): WaystationOpenPose => {
  const age = Math.max(0, ageMs);
  const lock = clamp01(age / WAYSTATION_OPEN_LOCK_MS);
  const door = age <= WAYSTATION_OPEN_DOOR_START_MS ? 0 : backOut((age - WAYSTATION_OPEN_DOOR_START_MS) / WAYSTATION_OPEN_DOOR_MS);
  const core = easeOutCubic((age - WAYSTATION_OPEN_CORE_START_MS) / WAYSTATION_OPEN_CORE_MS);
  const opened = clamp01((age - WAYSTATION_OPEN_DOOR_START_MS) / WAYSTATION_OPEN_DOOR_MS);
  const burst = 1 + 0.7 * Math.sin(Math.PI * clamp01((age - WAYSTATION_OPEN_DOOR_START_MS) / 1400));
  const out = clamp01((age - WAYSTATION_OPEN_FADE_START_MS) / (WAYSTATION_OPEN_TOTAL_MS - WAYSTATION_OPEN_FADE_START_MS));
  return { lock, door, core, glow: Math.min(1.6, opened * burst), out, alpha: 1 - out, done: age >= WAYSTATION_OPEN_TOTAL_MS };
};

type WaystationUpdate = { x: number; y: number; waystationJson?: string };

const isActivatedRecord = (json: string | undefined): boolean => {
  if (!json) return false;
  try {
    const parsed = JSON.parse(json) as { activated?: unknown } | null;
    return parsed?.activated === true;
  } catch {
    return false;
  }
};

/**
 * Finds tiles in a TILE_DELTA_BATCH whose dormant rig was on screen and is
 * now reported collected. Must run before the batch is merged, because the
 * merge deletes an activated waystation from the tile.
 */
export const detectWaystationOpenings = (
  tiles: ReadonlyMap<string, Pick<Tile, "waystation" | "fogged">>,
  updates: ReadonlyArray<WaystationUpdate>,
  keyFor: (x: number, y: number) => string
): Array<{ x: number; y: number }> => {
  const found: Array<{ x: number; y: number }> = [];
  for (const update of updates) {
    if (!isActivatedRecord(update.waystationJson)) continue;
    const before = tiles.get(keyFor(update.x, update.y));
    if (!before?.waystation || before.waystation.activated || before.fogged) continue;
    found.push({ x: update.x, y: update.y });
  }
  return found;
};

/** Drops finished openings so neither renderer draws them again. */
export const expireWaystationOpenings = (state: WaystationOpenFxState, nowEpochMs: number): void => {
  for (const [key, entry] of state.waystationOpenFxByKey) {
    if (waystationOpeningAge(entry, nowEpochMs) === undefined) state.waystationOpenFxByKey.delete(key);
  }
  state.waystationOpenFxQueue = state.waystationOpenFxQueue.filter((entry) => waystationOpeningAge(entry, nowEpochMs) !== undefined);
};

/** Queues the opening for each detected tile, held until the map is visible (bounded; oldest dropped first). */
export const recordWaystationOpenings = (
  state: WaystationOpenFxState,
  openings: ReadonlyArray<{ x: number; y: number }>,
  keyFor: (x: number, y: number) => string,
  nowEpochMs: number
): void => {
  expireWaystationOpenings(state, nowEpochMs);
  for (const { x, y } of openings) {
    const entry: WaystationOpenFxEntry = { x, y, detectedAt: nowEpochMs };
    state.waystationOpenFxByKey.delete(keyFor(x, y));
    state.waystationOpenFxByKey.set(keyFor(x, y), entry);
    state.waystationOpenFxQueue.push(entry);
  }
  while (state.waystationOpenFxByKey.size > WAYSTATION_OPEN_FX_MAX) {
    const oldest = state.waystationOpenFxByKey.keys().next().value;
    if (oldest === undefined) break;
    state.waystationOpenFxByKey.delete(oldest);
  }
  if (state.waystationOpenFxQueue.length > WAYSTATION_OPEN_FX_MAX) state.waystationOpenFxQueue.splice(0, state.waystationOpenFxQueue.length - WAYSTATION_OPEN_FX_MAX);
};
