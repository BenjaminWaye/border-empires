// The result card ("Territory Claimed", "Victory"...) closes itself after a
// few seconds. A player reaching for its ✕ just as it closed had the tap land
// on the map under it instead: a fog tile selected, once a waypoint set
// (2026-11-13 playtest, pt-oldphone, three times). For a moment after the card
// closes on its own, a tap inside the area it covered is swallowed.

export const CAPTURE_CARD_GHOST_TAP_MS = 700;

type Rect = { left: number; top: number; right: number; bottom: number };

let hidden: { rect: Rect; at: number } | undefined;
/** A swallowed pointerdown also swallows the rest of that gesture (pointerup, click) until this time. */
let gestureSwallowUntil = 0;
let installedOn: Document | undefined;

/** True when a tap at (x, y) at `nowMs` lands where the card was, just after it closed itself. */
export const isCaptureCardGhostTap = (x: number, y: number, nowMs: number): boolean => {
  if (!hidden || nowMs - hidden.at > CAPTURE_CARD_GHOST_TAP_MS) return false;
  const { rect } = hidden;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

const swallow = (event: Event): void => {
  event.preventDefault();
  event.stopImmediatePropagation();
};

const onPointerDown = (event: Event): void => {
  const pointer = event as PointerEvent;
  const now = Date.now();
  if (!isCaptureCardGhostTap(pointer.clientX, pointer.clientY, now)) return;
  gestureSwallowUntil = now + CAPTURE_CARD_GHOST_TAP_MS;
  swallow(event);
};

const onGestureRest = (event: Event): void => {
  if (Date.now() <= gestureSwallowUntil) swallow(event);
};

const install = (doc: Document): void => {
  if (installedOn === doc) return;
  installedOn = doc;
  // Capture phase on the document runs before the map's own listeners.
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointerup", onGestureRest, true);
  doc.addEventListener("click", onGestureRest, true);
};

/** Call when the card closes on its own (not on its ✕), with the area it covered. */
export const noteCaptureCardAutoHidden = (rect: Rect, nowMs: number, doc: Document | undefined = typeof document === "undefined" ? undefined : document): void => {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return;
  hidden = { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, at: nowMs };
  if (doc) install(doc);
};

export const resetCaptureCardGhostTapForTests = (): void => {
  hidden = undefined;
  gestureSwallowUntil = 0;
};
