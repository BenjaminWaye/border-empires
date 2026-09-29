import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import {
  cancelArrowGesture,
  createIdleArrowGestureState,
  isArrowGestureDragging,
  releaseArrowGesture,
  startArrowGesture,
  updateArrowGesture,
  type ArrowGestureState
} from "./client-map-input-arrow-gesture.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";
import { triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";

// Workstream F1 (docs/replenishment-update-plan.md): binds real mouse events
// to the pure arrow-gesture state machine (client-map-input-arrow-gesture.ts)
// and its two live effects while dragging -- the 3D arrow visual (which
// reads state.arrowGesture from client-map-3d/client-map-3d.ts, same pattern
// as state.winChancePaint) and a live win-chance-paint update on whatever
// tile is currently under the drag's endpoint.
//
// Split out of client-map-input/client-map-input.ts (which sits right at the
// repo's 500-line file cap, per AGENTS.md) rather than inlined there --
// otherwise this hook alone would push that file over.
//
// On a confirmed release, the pair is handed to handleArrowGestureConfirm's
// seam (client-arrow-gesture-confirm.ts), which opens the confirm sheet
// (client-arrow-gesture-confirm-sheet.ts) that actually sends SET_MUSTER.

export type ArrowGestureInputDeps = {
  canvas: HTMLCanvasElement;
  keyFor: (x: number, y: number) => string;
  worldTileFromPointer: (offsetX: number, offsetY: number) => { wx: number; wy: number };
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
};

export const bindArrowGestureInput = (state: ClientState, deps: ArrowGestureInputDeps): void => {
  let arrowGestureState: ArrowGestureState = createIdleArrowGestureState();

  // F5 (docs/replenishment-update-plan.md): persistence audit. A drag with
  // no cancel path can be orphaned by a backgrounded tab (no mouseup ever
  // fires -- OS/browser can suspend delivery of it entirely) or a dropped WS
  // connection (the confirm on release would just fail server-side, but the
  // arrow visual and confirm-sheet-eligibility would linger client-side in
  // the meantime). Cancel outright rather than trying to resume: same
  // "re-arm after the interruption" UX as client-inplace-reconnect.ts forces
  // on the socket itself.
  const abandonActiveDrag = (): void => {
    if (!isArrowGestureDragging(arrowGestureState)) return;
    arrowGestureState = cancelArrowGesture();
    state.arrowGesture = undefined;
  };
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") abandonActiveDrag();
    });
  }
  window.addEventListener("blur", abandonActiveDrag);

  deps.canvas.addEventListener("mousedown", (ev) => {
    if (ev.button !== 2) return;
    const { wx, wy } = deps.worldTileFromPointer(ev.offsetX, ev.offsetY);
    const tile = state.tiles.get(deps.keyFor(wx, wy));
    if (!tile?.muster || tile.ownerId !== state.me) return;
    arrowGestureState = startArrowGesture({ x: wx, y: wy });
    state.arrowGesture = { origin: { x: wx, y: wy }, target: { x: wx, y: wy } };
  });

  deps.canvas.addEventListener("mousemove", (ev) => {
    if (!isArrowGestureDragging(arrowGestureState)) return;
    // The origin flag can be captured/destroyed by an opposing action, or
    // the WS connection can drop, mid-drag -- either way there is no longer
    // a legal SET_MUSTER to offer on release, so cancel now rather than let
    // the confirm sheet open for a flag that's gone (or a dead socket).
    const originTile = state.tiles.get(deps.keyFor(arrowGestureState.origin.x, arrowGestureState.origin.y));
    if (!originTile?.muster || originTile.ownerId !== state.me || state.connection === "disconnected") {
      abandonActiveDrag();
      return;
    }
    const { wx, wy } = deps.worldTileFromPointer(ev.offsetX, ev.offsetY);
    arrowGestureState = updateArrowGesture(arrowGestureState, { x: wx, y: wy });
    if (!isArrowGestureDragging(arrowGestureState)) return;
    state.arrowGesture = { origin: arrowGestureState.origin, target: arrowGestureState.current };
    // Live win-chance paint on the drag's current endpoint (F0's paint,
    // formerly only triggered by the old click-to-arm MARCH flow). Passing
    // "visible" unconditionally is a known simplification for this slice --
    // a fogged/unexplored endpoint under the cursor will still paint.
    triggerWinChancePaintOnMarchArm(state, arrowGestureState.origin.x, arrowGestureState.origin.y, wx, wy, "visible", deps.keyFor, performance.now());
  });

  window.addEventListener("mouseup", (ev) => {
    if (ev.button !== 2 || !isArrowGestureDragging(arrowGestureState)) return;
    const rect = deps.canvas.getBoundingClientRect();
    const { wx, wy } = deps.worldTileFromPointer(ev.clientX - rect.left, ev.clientY - rect.top);
    const { next, result } = releaseArrowGesture(arrowGestureState, { x: wx, y: wy });
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
  });
};
