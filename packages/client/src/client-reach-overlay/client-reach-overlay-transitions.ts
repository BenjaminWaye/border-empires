// Pure, framework-independent diffing/timing logic for animating the
// Aether Survey Line pylons/segments across a border change: a pylon that's
// no longer part of the current boundary sinks into the ground (laser off
// first, then retract) instead of just vanishing; a newly-added one rises
// out of the ground (then powers its laser on) instead of just appearing.
// No Three.js/DOM here so this is trivially unit-testable -- the 3D caller
// (client-map-3d.ts, or a Storybook demo) only has to keep one
// TransitionTracker alive across frames and call diffTransitions() with
// this frame's desired point/segment set every frame, then feed the
// returned frames (each carrying riseFraction/laserFraction) into
// ReachOverlay3D's addPylon/addLineSegment.

/** How long a retiring pylon's laser takes to fade out before it starts sinking. */
export const RETIRE_LASER_FADE_MS = 300;
/** How long a retiring pylon takes to sink into the ground once its laser is off. */
export const RETIRE_SINK_MS = 600;
/** How long an arriving pylon takes to rise out of the ground before its laser turns on. */
export const ARRIVE_RISE_MS = 600;
/** How long an arriving pylon's laser takes to power on once it's fully risen. */
export const ARRIVE_LASER_ON_MS = 300;

export const RETIRE_TOTAL_MS = RETIRE_LASER_FADE_MS + RETIRE_SINK_MS;
export const ARRIVE_TOTAL_MS = ARRIVE_RISE_MS + ARRIVE_LASER_ON_MS;

export type TransitionPhase = "arriving" | "idle" | "retiring";

/** One item's current animation frame: how risen (0 = fully sunk) and how lit (0 = laser off) it is right now. */
export type TransitionFrame = {
  readonly riseFraction: number;
  readonly laserFraction: number;
};

type TrackedEntry<T> = {
  phase: TransitionPhase;
  startedAt: number;
  value: T;
};

/** Persist one of these per overlay (one for pylons, one for segments) across frames -- opaque to callers beyond passing it back into diffTransitions each time. */
export type TransitionTracker<T> = Map<string, TrackedEntry<T>>;

export const createTransitionTracker = <T>(): TransitionTracker<T> => new Map();

// Smoothstep -- gentle ease in/out, avoids the slightly mechanical look of
// a linear rise/sink or a linear laser fade.
const ease = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const frameFor = (entry: Pick<TrackedEntry<unknown>, "phase" | "startedAt">, nowMs: number): TransitionFrame => {
  const elapsed = Math.max(0, nowMs - entry.startedAt);
  if (entry.phase === "idle") return { riseFraction: 1, laserFraction: 1 };
  if (entry.phase === "arriving") {
    if (elapsed < ARRIVE_RISE_MS) return { riseFraction: ease(elapsed / ARRIVE_RISE_MS), laserFraction: 0 };
    return { riseFraction: 1, laserFraction: ease((elapsed - ARRIVE_RISE_MS) / ARRIVE_LASER_ON_MS) };
  }
  // retiring
  if (elapsed < RETIRE_LASER_FADE_MS) return { riseFraction: 1, laserFraction: 1 - ease(elapsed / RETIRE_LASER_FADE_MS) };
  return { riseFraction: 1 - ease((elapsed - RETIRE_LASER_FADE_MS) / RETIRE_SINK_MS), laserFraction: 0 };
};

const isRetireComplete = (entry: Pick<TrackedEntry<unknown>, "phase" | "startedAt">, nowMs: number): boolean =>
  entry.phase === "retiring" && nowMs - entry.startedAt >= RETIRE_TOTAL_MS;

const isArriveComplete = (entry: Pick<TrackedEntry<unknown>, "phase" | "startedAt">, nowMs: number): boolean =>
  entry.phase === "arriving" && nowMs - entry.startedAt >= ARRIVE_TOTAL_MS;

/**
 * Diffs `current` (this frame's desired keyed items -- e.g. corner
 * positions for pylons, "fromKey|toKey" pairs for segments) against the
 * `tracker` (persisted by the caller across frames) and returns one
 * TransitionFrame-augmented item per key that should still be rendered
 * this frame -- which includes keys no longer in `current` but still
 * mid-retirement (their last known value is remembered on the tracker
 * itself, so the caller never has to keep a separate "last value" map).
 *
 * Mutates `tracker` in place:
 * - A brand-new key starts "arriving" (or lands straight on "idle" if
 *   `animateInitial` is false -- avoids the whole initial boundary rising
 *   out of the ground on first load).
 * - A key that just dropped out of `current` starts "retiring".
 * - A key that reappears mid-retirement resurrects as a fresh "arriving"
 *   from wherever it currently is, instead of snapping back to full height.
 * - An "arriving" key flips to "idle" once its transition finishes; a
 *   "retiring" key is dropped from the tracker entirely once its sink
 *   finishes (never returned again).
 */
export const diffTransitions = <T>(
  current: ReadonlyMap<string, T>,
  tracker: TransitionTracker<T>,
  nowMs: number,
  options?: { animateInitial?: boolean }
): Map<string, T & TransitionFrame> => {
  const animateInitial = options?.animateInitial ?? true;
  const out = new Map<string, T & TransitionFrame>();

  for (const [key, value] of current) {
    const existing = tracker.get(key);
    let entry: TrackedEntry<T>;
    if (!existing) {
      entry = { phase: animateInitial ? "arriving" : "idle", startedAt: nowMs, value };
    } else if (existing.phase === "retiring") {
      entry = { phase: "arriving", startedAt: nowMs, value };
    } else if (existing.phase === "arriving" && isArriveComplete(existing, nowMs)) {
      entry = { phase: "idle", startedAt: existing.startedAt, value };
    } else {
      existing.value = value; // keep position/color fresh even while idle/arriving
      entry = existing;
    }
    tracker.set(key, entry);
    out.set(key, { ...entry.value, ...frameFor(entry, nowMs) });
  }

  for (const [key, entry] of tracker) {
    if (current.has(key)) continue;
    if (entry.phase !== "retiring") {
      entry.phase = "retiring";
      entry.startedAt = nowMs;
    }
    if (isRetireComplete(entry, nowMs)) {
      tracker.delete(key);
      continue;
    }
    out.set(key, { ...entry.value, ...frameFor(entry, nowMs) });
  }

  return out;
};
