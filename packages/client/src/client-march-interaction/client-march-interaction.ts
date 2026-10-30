// Makes March To interactive:
//   - while a March To target is being picked, a banner says what to do (tap
//     the tile to march to, with a Cancel) and an arrow follows the pointer
//     from the flag, showing the distance and when it is too far;
//   - a marching flag's destination can be dragged to a new tile: press on
//     the march target, drag, release, and the flag re-targets (no confirm
//     sheet; its committed effort is kept by the server).
// Both draw through state.arrowGesture, which the 2D (client-runtime-loop.ts)
// and true-3D (client-map-3d-arrow-overlay.ts) renderers already read every
// frame, so the preview shows in either renderer.

import { MUSTER_MARCH_MAX_DISTANCE_TILES, musterMarchDistanceTiles, musterMarchTooFarAdvice } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { findMarchOriginsForTarget } from "../client-muster-march-targeting.js";
import { musterSiegeReason, ownTileSiegeAt } from "../client-muster-siege/client-muster-siege.js";

type MarchState = Pick<ClientState, "tiles" | "me" | "hover" | "musterMarchTargeting" | "marchOriginPicking" | "arrowGesture" | "pendingArrowGestureConfirm" | "incomingAttacksByTile">;
type Point = { x: number; y: number };

export type MarchInteractionDeps = {
  state: MarchState;
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
};

export const MARCH_HINT_ID = "march-targeting-hint";
const NOTICE_MS = 4_000;
/** Screen pixels the pointer must travel before a press on a march target becomes a drag (a shaky tap never moves a march). */
export const MARCH_DRAG_SLOP_PX = 12;

let deps: MarchInteractionDeps | undefined;
let drag: { origin: Point; from: Point; current: Point; pressAt: Point; dragging: boolean } | undefined;
/** True while the arrow on screen is this module's preview (so it can clear it again). */
let previewShown = false;
let notice: { text: string; until: number } | undefined;
let hintVisible = false;

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** Banner text for the current targeting state, or undefined when nothing is being targeted. */
export const marchHintText = (state: MarchState, nowMs: number, dragging = drag): string | undefined => {
  if (notice && notice.until > nowMs) return notice.text;
  if (dragging) {
    const tiles = musterMarchDistanceTiles(dragging.origin.x, dragging.origin.y, dragging.current.x, dragging.current.y);
    return `Release to march to (${dragging.current.x}, ${dragging.current.y}) · ${tiles} tiles${tiles > MUSTER_MARCH_MAX_DISTANCE_TILES ? " · too far" : ""}`;
  }
  const t = state.musterMarchTargeting;
  if (!t.active || state.pendingArrowGestureConfirm) return undefined;
  const head = `Tap the tile the flag at (${t.originX}, ${t.originY}) should march to (up to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles)`;
  const hover = state.hover;
  if (!hover || (hover.x === t.originX && hover.y === t.originY)) return head;
  const tiles = musterMarchDistanceTiles(t.originX, t.originY, hover.x, hover.y);
  return `${head} · (${hover.x}, ${hover.y}) is ${tiles} tiles${tiles > MUSTER_MARCH_MAX_DISTANCE_TILES ? ", too far" : ""}`;
};

const hintEl = (): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(MARCH_HINT_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = MARCH_HINT_ID;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:60;display:none;align-items:center;gap:12px;" +
    "padding:10px 14px;border-radius:10px;background:rgba(20,18,12,0.92);border:1px solid #ffd54a;color:#fff3c4;" +
    "font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.45);max-width:calc(100vw - 32px)";
  el.innerHTML = `<span data-march-hint-text></span><button type="button" data-march-hint-cancel style="font:inherit;padding:4px 10px;border-radius:6px;border:1px solid #ffd54a;background:transparent;color:inherit;cursor:pointer">Cancel</button>`;
  el.querySelector("[data-march-hint-cancel]")?.addEventListener("click", cancelMarchTargeting);
  document.body.appendChild(el);
  return el;
};

/** Stops picking a march target (the banner's Cancel). */
export const cancelMarchTargeting = (): void => {
  if (!deps) return;
  const { state } = deps;
  state.musterMarchTargeting.active = false;
  if (previewShown && !state.pendingArrowGestureConfirm) state.arrowGesture = undefined;
  previewShown = false;
  notice = undefined;
  deps.renderHud();
};

/** Per-frame: the pointer-following arrow while targeting, and the banner. */
export const syncMarchInteraction = (nowMs: number): void => {
  if (!deps) return;
  const { state } = deps;
  const t = state.musterMarchTargeting;
  if (!drag && t.active && !state.pendingArrowGestureConfirm) {
    const origin = { x: t.originX, y: t.originY };
    const hover = state.hover;
    const target = hover && !same(hover, origin) ? hover : undefined;
    const current = state.arrowGesture;
    if (!target) {
      if (previewShown) state.arrowGesture = undefined;
    } else if (!current || !same(current.target, target) || !same(current.origin, origin)) {
      state.arrowGesture = { origin, target: { x: target.x, y: target.y } };
    }
    previewShown = Boolean(target);
  } else if (previewShown && !drag) {
    if (!state.pendingArrowGestureConfirm) state.arrowGesture = undefined;
    previewShown = false;
  }
  const text = marchHintText(state, nowMs);
  // Nothing to show and already hidden: no DOM work this frame.
  if (!text && !hintVisible) return;
  const el = hintEl();
  if (!el) return;
  hintVisible = Boolean(text);
  const textEl = el.querySelector<HTMLElement>("[data-march-hint-text]");
  if (textEl && textEl.textContent !== (text ?? "")) textEl.textContent = text ?? "";
  const cancel = el.querySelector<HTMLElement>("[data-march-hint-cancel]");
  if (cancel) cancel.style.display = t.active && !drag ? "" : "none";
  el.style.display = text ? "flex" : "none";
};

/**
 * Press on a tile one of your flags is marching to: start dragging that march's destination. Returns true when
 * the press started a drag (the map then must not pan or box-select).
 */
const beginDrag = (x: number, y: number, clientX: number, clientY: number): boolean => {
  if (!deps) return false;
  const { state } = deps;
  if (state.musterMarchTargeting.active || state.marchOriginPicking.active || state.pendingArrowGestureConfirm) return false;
  const origin = findMarchOriginsForTarget(state, x, y)[0];
  if (!origin) return false;
  drag = { origin: { x: origin.originX, y: origin.originY }, from: { x, y }, current: { x, y }, pressAt: { x: clientX, y: clientY }, dragging: false };
  state.arrowGesture = { origin: drag.origin, target: { x, y } };
  return true;
};

const moveDrag = (x: number, y: number, clientX: number, clientY: number): boolean => {
  if (!drag || !deps) return false;
  if (!drag.dragging) drag.dragging = Math.hypot(clientX - drag.pressAt.x, clientY - drag.pressAt.y) > MARCH_DRAG_SLOP_PX;
  if (drag.dragging && (drag.current.x !== x || drag.current.y !== y)) {
    drag.current = { x, y };
    deps.state.arrowGesture = { origin: drag.origin, target: { x, y } };
  }
  return true;
};

/** "moved": the march was re-targeted (or refused), so the release is not a tile click; "none": no drag happened. */
const endDrag = (nowMs = Date.now()): "moved" | "tap" | "none" => {
  if (!drag || !deps) return "none";
  const done = drag;
  drag = undefined;
  deps.state.arrowGesture = undefined;
  if (same(done.current, done.from)) return "tap";
  if (same(done.current, done.origin)) {
    notice = { text: "Drag the march target onto another tile to move it.", until: nowMs + NOTICE_MS };
    return "moved";
  }
  const siege = ownTileSiegeAt(deps.state, done.origin.x, done.origin.y, nowMs);
  if (siege) {
    notice = { text: `${musterSiegeReason(siege, nowMs)}. The march keeps its old target.`, until: nowMs + NOTICE_MS };
    return "moved";
  }
  const tooFar = musterMarchTooFarAdvice(musterMarchDistanceTiles(done.origin.x, done.origin.y, done.current.x, done.current.y));
  if (tooFar) {
    notice = { text: `Too far: marches reach up to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles. The march keeps its old target.`, until: nowMs + NOTICE_MS };
    return "moved";
  }
  const sent = deps.sendGameMessage({ type: "SET_MUSTER", x: done.origin.x, y: done.origin.y, mode: "MARCH", targetX: done.current.x, targetY: done.current.y });
  notice = sent
    ? { text: `Marching to (${done.current.x}, ${done.current.y}).`, until: nowMs + 2_000 }
    : { text: "Not connected: the march keeps its old target.", until: nowMs + NOTICE_MS };
  deps.renderHud();
  return "moved";
};

const cancelDrag = (): void => {
  if (!drag || !deps) return;
  drag = undefined;
  deps.state.arrowGesture = undefined;
};

/** Hooks the map input calls; no-ops until installMarchInteraction has run. */
export const marchTargetDrag = { begin: beginDrag, move: moveDrag, end: endDrag, cancel: cancelDrag, active: (): boolean => drag !== undefined };

export const installMarchInteraction = (next: MarchInteractionDeps): void => {
  const first = deps === undefined;
  deps = next;
  if (!first || typeof requestAnimationFrame === "undefined") return;
  const frame = (): void => {
    syncMarchInteraction(Date.now());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

/** Test seam: forget installed deps and any drag in progress. */
export const resetMarchInteractionForTest = (): void => {
  deps = undefined;
  drag = undefined;
  previewShown = false;
  notice = undefined;
  hintVisible = false;
};
