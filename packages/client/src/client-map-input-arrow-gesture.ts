// Workstream F1 (docs/replenishment-update-plan.md): right-click-drag
// straight-line arrow gesture, pure state machine only. Deliberately free of
// Three.js/DOM specifics (no canvas, no scene, no event objects) so both the
// desktop right-drag wiring (this phase) and the future mobile long-press
// wiring (F2, not this task) can drive the same "arm point A, drag, release
// at point B, fire onConfirm(a,b)" shape with their own input plumbing.
//
// Kept out of client-map-input/client-map-input.ts (already at the repo's
// 500-line file cap per AGENTS.md) — that file only wires a handful of DOM
// event call-outs into this module's start/move/release/cancel functions.

export type ArrowGesturePoint = { x: number; y: number };

export type ArrowGestureState =
  | { phase: "idle" }
  | { phase: "dragging"; origin: ArrowGesturePoint; current: ArrowGesturePoint };

export const createIdleArrowGestureState = (): ArrowGestureState => ({ phase: "idle" });

/**
 * Starts a drag from `origin` (the owned muster-flag tile the caller has
 * already validated is legal to arm from). Always transitions to
 * "dragging" — callers are expected to have done the "is this an owned
 * muster flag" check before calling start (this module has no tile/game
 * knowledge of its own).
 */
export const startArrowGesture = (origin: ArrowGesturePoint): ArrowGestureState => ({
  phase: "dragging",
  origin,
  current: origin
});

/**
 * Updates the live "current" tile under the cursor while dragging. No-op
 * (returns state unchanged) if not currently dragging, so a stray mousemove
 * after mouseup/cancel can't resurrect a finished gesture.
 */
export const updateArrowGesture = (state: ArrowGestureState, current: ArrowGesturePoint): ArrowGestureState => {
  if (state.phase !== "dragging") return state;
  if (state.current.x === current.x && state.current.y === current.y) return state;
  return { ...state, current };
};

export type ArrowGestureRelease =
  | { type: "confirm"; origin: ArrowGesturePoint; target: ArrowGesturePoint }
  | { type: "cancelled" };

/**
 * Ends a drag at `target`. Releasing back on the origin tile itself is
 * treated as a cancel (mirrors handleMusterMarchTargetClick's own
 * "clicked own tile" cancel rule in client-muster-march-targeting.ts) rather
 * than firing a zero-length arrow. Always returns to "idle" as the next
 * state regardless of outcome.
 */
export const releaseArrowGesture = (
  state: ArrowGestureState,
  target: ArrowGesturePoint
): { next: ArrowGestureState; result: ArrowGestureRelease } => {
  const next = createIdleArrowGestureState();
  if (state.phase !== "dragging") return { next, result: { type: "cancelled" } };
  if (target.x === state.origin.x && target.y === state.origin.y) {
    return { next, result: { type: "cancelled" } };
  }
  return { next, result: { type: "confirm", origin: state.origin, target } };
};

/** Aborts a drag (e.g. Escape, or the origin flag disappearing mid-drag) without firing onConfirm. Idle input is a no-op. */
export const cancelArrowGesture = (): ArrowGestureState => createIdleArrowGestureState();

export const isArrowGestureDragging = (
  state: ArrowGestureState
): state is Extract<ArrowGestureState, { phase: "dragging" }> => state.phase === "dragging";
