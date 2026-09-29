import { handleArrowGestureConfirm } from "./client-arrow-gesture-confirm.js";
import {
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
