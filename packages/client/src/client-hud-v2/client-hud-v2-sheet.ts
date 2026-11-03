// Bottom sheet for the compact (phone) HUD: three detents (peek, half, full), a
// grabber that drags between them, and the phone's back gesture closing the
// top sheet. Phase 0 of docs/hud-v2-mobile-plan.md; the tile sheet, Chronicle,
// Treasury and town screens build on it in later phases.
//
// Drags start only on the grabber, so a drag that starts on the map still pans
// it. At peek and half the map above the sheet stays interactive; at full it
// is covered.

export type SheetDetent = "peek" | "half" | "full";

const DETENT_ORDER: readonly SheetDetent[] = ["peek", "half", "full"];

/** Peek shows the sheet's header row and action bar. */
export const SHEET_PEEK_PX = 120;
/** A release faster than this (px/ms) flings to the next detent in that direction. */
export const SHEET_FLING_PX_PER_MS = 0.5;

export const detentHeight = (detent: SheetDetent, viewportHeight: number): number => {
  if (detent === "peek") return Math.round(Math.min(SHEET_PEEK_PX, viewportHeight * 0.4));
  if (detent === "half") return Math.round(viewportHeight * 0.5);
  return Math.round(viewportHeight * 0.9);
};

const ordered = (allowed: readonly SheetDetent[]): SheetDetent[] => DETENT_ORDER.filter((d) => allowed.includes(d));

/**
 * Where a released drag settles. `velocity` is px/ms, positive when the sheet is growing.
 * Dragging well below the lowest detent, or flinging down from it, closes the sheet.
 */
export const snapDetent = (heightPx: number, velocity: number, viewportHeight: number, allowed: readonly SheetDetent[]): SheetDetent | "closed" => {
  const detents = ordered(allowed);
  if (detents.length === 0) return "closed";
  const heights = detents.map((d) => detentHeight(d, viewportHeight));
  const lowest = heights[0]!;
  if (velocity > SHEET_FLING_PX_PER_MS) return detents[heights.findIndex((h) => h > heightPx)] ?? detents[detents.length - 1]!;
  if (velocity < -SHEET_FLING_PX_PER_MS) {
    const below = heights.map((h, i) => (h < heightPx ? i : -1)).filter((i) => i >= 0);
    return below.length > 0 ? detents[below[below.length - 1]!]! : "closed";
  }
  if (heightPx < lowest / 2) return "closed";
  let best = 0;
  heights.forEach((h, i) => {
    if (Math.abs(h - heightPx) < Math.abs(heights[best]! - heightPx)) best = i;
  });
  return detents[best]!;
};

/** Whether the map above the sheet still takes taps and pans at this detent. */
export const sheetLetsMapThrough = (detent: SheetDetent): boolean => detent !== "full";

type SheetHistory = Pick<History, "pushState" | "back">;
type SheetWindow = Pick<Window, "addEventListener" | "removeEventListener" | "innerHeight">;

export type HudV2SheetOptions = {
  /** Detents this sheet may rest at (default all three). */
  detents?: readonly SheetDetent[];
  initial?: SheetDetent;
  label: string;
  onDetentChange?: (detent: SheetDetent) => void;
  /** Called once the sheet has closed, whether by drag, back gesture or close(). */
  onClose?: () => void;
  /** Injected for tests. */
  history?: SheetHistory;
  win?: SheetWindow;
};

export type HudV2Sheet = {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  detent: () => SheetDetent | "closed";
  setDetent: (detent: SheetDetent) => void;
  close: () => void;
};

/** Open sheets, newest last; the back gesture closes the newest. */
const stack: Array<{ close: (fromBack: boolean) => void }> = [];
let backListening = false;
let ignoreNextPop = 0;

const onPopState = (): void => {
  if (ignoreNextPop > 0) {
    ignoreNextPop -= 1;
    return;
  }
  stack[stack.length - 1]?.close(true);
};

export const openSheetCount = (): number => stack.length;

export const createHudV2Sheet = (host: HTMLElement, options: HudV2SheetOptions): HudV2Sheet => {
  const win: SheetWindow = options.win ?? window;
  const history: SheetHistory = options.history ?? window.history;
  const allowed = ordered(options.detents ?? DETENT_ORDER);
  const doc = host.ownerDocument;
  const el = doc.createElement("section");
  el.className = "hud-v2-sheet";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", options.label);
  const grabber = doc.createElement("button");
  grabber.type = "button";
  grabber.className = "hud-v2-sheet-grabber";
  grabber.setAttribute("aria-label", `Resize ${options.label}`);
  const body = doc.createElement("div");
  body.className = "hud-v2-sheet-body";
  el.append(grabber, body);
  host.appendChild(el);

  let current: SheetDetent | "closed" = options.initial && allowed.includes(options.initial) ? options.initial : (allowed[0] ?? "closed");
  const applyHeight = (px: number): void => el.style.setProperty("--v2-sheet-h", `${Math.max(0, Math.round(px))}px`);
  const apply = (): void => {
    if (current === "closed") return;
    applyHeight(detentHeight(current, win.innerHeight));
    el.dataset.detent = current;
  };

  const entry = {
    close: (fromBack: boolean): void => {
      if (current === "closed") return;
      current = "closed";
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      // Closed from the UI: drop the history entry the sheet pushed, without that pop closing another sheet.
      if (!fromBack) {
        ignoreNextPop += 1;
        history.back();
      }
      el.remove();
      options.onClose?.();
    }
  };

  const setDetent = (detent: SheetDetent): void => {
    if (current === "closed" || !allowed.includes(detent)) return;
    const changed = detent !== current;
    current = detent;
    apply();
    if (changed) options.onDetentChange?.(detent);
  };

  let drag: { startY: number; startH: number; lastY: number; lastT: number; velocity: number } | undefined;
  grabber.addEventListener("pointerdown", (event) => {
    if (current === "closed") return;
    const startH = detentHeight(current, win.innerHeight);
    drag = { startY: event.clientY, startH, lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
    el.classList.add("hud-v2-sheet-dragging");
    grabber.setPointerCapture?.(event.pointerId);
  });
  grabber.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (drag.lastY - event.clientY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    applyHeight(drag.startH + (drag.startY - event.clientY));
  });
  const release = (event: PointerEvent): void => {
    if (!drag) return;
    const height = drag.startH + (drag.startY - event.clientY);
    const target = snapDetent(height, drag.velocity, win.innerHeight, allowed);
    drag = undefined;
    el.classList.remove("hud-v2-sheet-dragging");
    if (target === "closed") entry.close(false);
    else {
      setDetent(target);
      apply();
    }
  };
  grabber.addEventListener("pointerup", release);
  grabber.addEventListener("pointercancel", release);

  if (!backListening) {
    win.addEventListener("popstate", onPopState);
    backListening = true;
  }
  history.pushState({ hudV2Sheet: options.label }, "");
  stack.push(entry);
  apply();

  return { el, body, detent: () => current, setDetent, close: () => entry.close(false) };
};
