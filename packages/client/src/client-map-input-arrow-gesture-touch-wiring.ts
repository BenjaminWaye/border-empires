import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import {
  cancelArrowGesture,
  createIdleArrowGestureState,
  isArrowGestureDragging,
  releaseArrowGesture,
  startArrowGesture,
  updateArrowGesture,
  type ArrowGesturePoint,
  type ArrowGestureState
} from "./client-map-input-arrow-gesture.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";
import { triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";

// Workstream F2 (docs/replenishment-update-plan.md): mobile long-press +
// drag counterpart to F1's desktop right-click-drag wiring
// (client-map-input-arrow-gesture-wiring.ts). Drives the SAME pure state
// machine (client-map-input-arrow-gesture.ts) and the SAME confirm seam
// (client-arrow-gesture-confirm.ts) -- only the input plumbing differs.
//
// A touch that starts on an owned muster-flag tile arms a long-press timer
// (TOUCH_LONG_PRESS_MS). If the touch moves more than
// TOUCH_LONG_PRESS_MAX_MOVE_PX before the timer fires, the press is treated
// as an ordinary pan/scroll and the timer is simply cancelled -- the
// existing camera-pan touch handling in client-map-input.ts already pans on
// every touchmove regardless of this module, so nothing else needs to
// happen for that case. Once the timer fires without excess movement, the
// gesture arms: deps.suppressPanAndTap() tells the caller to drop its own
// in-flight pan/tap tracking for this same touch (clearing its local
// touchPanStart/touchTapCandidate) so the two handlers don't fight over one
// finger, and control moves fully to the shared state machine from there.
//
// Split out of client-map-input/client-map-input.ts (already at the repo's
// 500-line file cap per AGENTS.md) rather than inlined there, same reason
// as the F1 desktop wiring.

export const TOUCH_LONG_PRESS_MS = 450;
export const TOUCH_LONG_PRESS_MAX_MOVE_PX = 12;

/** Pure: has a touch moved far enough from its start point to no longer count as a held-still long-press? */
export const exceedsLongPressMoveThreshold = (dx: number, dy: number, thresholdPx: number): boolean =>
  Math.hypot(dx, dy) > thresholdPx;

export type ArrowGestureTouchInputDeps = {
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  worldTileFromPointer: (offsetX: number, offsetY: number) => { wx: number; wy: number };
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
  /** Called once, right as the long-press fires and the gesture arms, so the caller can drop its own pan/tap tracking for this same touch. */
  suppressPanAndTap: () => void;
};

export const bindArrowGestureTouchInput = (state: ClientState, deps: ArrowGestureTouchInputDeps): void => {
  let arrowGestureState: ArrowGestureState = createIdleArrowGestureState();
  let pressStart: { x: number; y: number } | undefined;
  let longPressTimer: number | undefined;

  const tileAt = (clientX: number, clientY: number): ArrowGesturePoint => {
    const rect = deps.canvas.getBoundingClientRect();
    const { wx, wy } = deps.worldTileFromPointer(clientX - rect.left, clientY - rect.top);
    return { x: wx, y: wy };
  };

  const clearPending = (): void => {
    pressStart = undefined;
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  };

  const armGesture = (clientX: number, clientY: number): void => {
    longPressTimer = undefined;
    pressStart = undefined;
    const origin = tileAt(clientX, clientY);
    const tile = state.tiles.get(deps.keyFor(origin.x, origin.y));
    if (!tile?.muster || tile.ownerId !== state.me) return;
    deps.suppressPanAndTap();
    arrowGestureState = startArrowGesture(origin);
    state.arrowGesture = { origin, target: origin };
  };

  deps.canvas.addEventListener(
    "touchstart",
    (ev) => {
      if (ev.touches.length !== 1) {
        clearPending();
        return;
      }
      const t = ev.touches[0];
      if (!t) return;
      const origin = tileAt(t.clientX, t.clientY);
      const tile = state.tiles.get(deps.keyFor(origin.x, origin.y));
      if (!tile?.muster || tile.ownerId !== state.me) return;
      pressStart = { x: t.clientX, y: t.clientY };
      longPressTimer = window.setTimeout(() => armGesture(t.clientX, t.clientY), TOUCH_LONG_PRESS_MS);
    },
    { passive: true }
  );

  deps.canvas.addEventListener(
    "touchmove",
    (ev) => {
      const t = ev.touches[0];
      if (pressStart && t && exceedsLongPressMoveThreshold(t.clientX - pressStart.x, t.clientY - pressStart.y, TOUCH_LONG_PRESS_MAX_MOVE_PX)) {
        clearPending();
      }
      if (!isArrowGestureDragging(arrowGestureState) || !t) return;
      const current = tileAt(t.clientX, t.clientY);
      arrowGestureState = updateArrowGesture(arrowGestureState, current);
      if (!isArrowGestureDragging(arrowGestureState)) return;
      state.arrowGesture = { origin: arrowGestureState.origin, target: arrowGestureState.current };
      triggerWinChancePaintOnMarchArm(
        state,
        arrowGestureState.origin.x,
        arrowGestureState.origin.y,
        current.x,
        current.y,
        "visible",
        deps.keyFor,
        performance.now()
      );
    },
    { passive: true }
  );

  const endTouch = (ev: TouchEvent): void => {
    clearPending();
    if (!isArrowGestureDragging(arrowGestureState)) return;
    const t = ev.changedTouches[0];
    const target = t ? tileAt(t.clientX, t.clientY) : arrowGestureState.current;
    const { next, result } = releaseArrowGesture(arrowGestureState, target);
    arrowGestureState = next;
    state.arrowGesture = undefined;
    if (result.type === "confirm") {
      handleArrowGestureConfirm(state, result.origin, result.target, {
        pushFeed: deps.pushFeed,
        sendGameMessage: deps.sendGameMessage,
        renderHud: deps.renderHud,
        keyFor: deps.keyFor
      });
    }
  };

  deps.canvas.addEventListener("touchend", endTouch, { passive: true });
  deps.canvas.addEventListener(
    "touchcancel",
    () => {
      clearPending();
      if (isArrowGestureDragging(arrowGestureState)) {
        arrowGestureState = cancelArrowGesture();
        state.arrowGesture = undefined;
      }
    },
    { passive: true }
  );
};
