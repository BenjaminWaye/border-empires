import type { Tile } from "../client-types.js";

// Holo-Locked Stack waystation: the moment a rig is collected. The server
// clears an activated waystation from the map, so the client keeps a short,
// renderer-agnostic record of each opening and both renderers play the same
// short timeline from it (the cache leaves as soon as it is open):
//   0     - 500 ms  the seal orb flares and bursts
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

/** `mine`: the local player collected it, so their reward card is what may be covering the map. */
export type WaystationOpenFxEntry = { x: number; y: number; mine: boolean; detectedAt: number; startedAt?: number };

/** A consumed record older than this (server clock) is a re-send of an old collection, not a live one. */
export const WAYSTATION_OPEN_MAX_RECORD_AGE_MS = 5 * 60_000;

/**
 * Starts a held opening's clock; true while it is running. Only the
 * collector's own opening waits for `covered()` (their reward card) to clear:
 * everyone else watches it as it happens.
 */
export const beginWaystationOpening = (entry: WaystationOpenFxEntry, nowEpochMs: number, covered: () => boolean): boolean => {
  if (entry.startedAt === undefined && (!entry.mine || !covered())) entry.startedAt = nowEpochMs;
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
  /** 0 intact seal orb .. 1 fully burst. */
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

type ActivatedRecord = { activatedByPlayerId?: unknown; activatedAt?: unknown };
const activatedRecord = (json: string | undefined): ActivatedRecord | undefined => {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as ({ activated?: unknown } & ActivatedRecord) | null;
    return parsed?.activated === true ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Finds tiles in a TILE_DELTA_BATCH whose dormant rig was on screen and is
 * now reported collected. Must run before the batch is merged, because the
 * merge deletes an activated waystation from the tile.
 */
export type WaystationOpening = { x: number; y: number; mine: boolean };

export const detectWaystationOpenings = (
  tiles: ReadonlyMap<string, Pick<Tile, "waystation" | "fogged">>,
  updates: ReadonlyArray<WaystationUpdate>,
  keyFor: (x: number, y: number) => string,
  me: string,
  serverNowMs: number
): WaystationOpening[] => {
  const found: WaystationOpening[] = [];
  for (const update of updates) {
    const record = activatedRecord(update.waystationJson);
    if (!record) continue;
    // A stamped record from long ago is a consumed site being re-sent, not a collection happening now.
    if (typeof record.activatedAt === "number" && serverNowMs - record.activatedAt > WAYSTATION_OPEN_MAX_RECORD_AGE_MS) continue;
    const before = tiles.get(keyFor(update.x, update.y));
    if (!before?.waystation || before.waystation.activated || before.fogged) continue;
    found.push({ x: update.x, y: update.y, mine: Boolean(me) && record.activatedByPlayerId === me });
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

/**
 * Once per frame in either renderer (client-map-screen-overlays.ts): starts
 * held clocks the moment the map is clear, whether or not the tile is on
 * screen, so 2D and true-3D run every opening on the same timeline; then
 * drops finished ones.
 */
export const advanceWaystationOpenings = (state: WaystationOpenFxState, nowEpochMs: number, covered: () => boolean): void => {
  if (state.waystationOpenFxByKey.size === 0 && state.waystationOpenFxQueue.length === 0) return;
  for (const entry of state.waystationOpenFxByKey.values()) beginWaystationOpening(entry, nowEpochMs, covered);
  for (const entry of state.waystationOpenFxQueue) beginWaystationOpening(entry, nowEpochMs, covered);
  expireWaystationOpenings(state, nowEpochMs);
};

/** Queues the opening for each detected tile; the collector's own waits for their reward card (bounded; oldest dropped first). */
export const recordWaystationOpenings = (
  state: WaystationOpenFxState,
  openings: ReadonlyArray<WaystationOpening>,
  keyFor: (x: number, y: number) => string,
  nowEpochMs: number
): void => {
  expireWaystationOpenings(state, nowEpochMs);
  for (const { x, y, mine } of openings) {
    const entry: WaystationOpenFxEntry = { x, y, mine, detectedAt: nowEpochMs };
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
