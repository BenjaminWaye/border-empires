// When an unprompted notice (a full-screen card such as Town Captured, the House Charges announcement) may
// appear. First-15 playtest (2026-11-28, 8 of 15 players): Town Captured slid over the open House Charges
// panel and took the tap meant for it, landed over the next Explore tap, and the charges note popped up over a
// confirm sheet. A notice now waits while a sheet or modal is open, and while the player is mid-tap, so it never
// arrives under a finger.
import { setFullscreenCardHold } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";

/** Modals and sheets a notice must not cover. */
const MODAL_SELECTORS = [
  "body.hud-v2-screen-open", // a full HUD screen (Manifest, Diplomacy, Chronicle, ...)
  ".break-pact-overlay", // confirm sheets ("Change empire?", break pact)
  ".diplomacy-trade-overlay", // a deal being drafted
  "#discovery-tip-overlay" // a tip card the player opened from its pin
] as const;
/** Shown and hidden with an inline display: the HUD panel host (House Charges, Economy, ...) and the profile editor. */
const INLINE_DISPLAY_IDS = ["side-panel", "profile-edit-overlay"] as const;

/** A notice waits this long after the last press ends, so it never lands under the next tap. */
export const NOTICE_QUIET_MS = 700;

const shownInline = (el: HTMLElement | null): boolean => el !== null && el.style.display !== "" && el.style.display !== "none";

/** True while a sheet or modal that a notice would cover is open. */
export const noticeModalOpen = (doc: Document): boolean =>
  MODAL_SELECTORS.some((selector) => doc.querySelector(selector) !== null) ||
  INLINE_DISPLAY_IDS.some((id) => shownInline(doc.getElementById(id)));

let pressing = false;
let lastPressAt = Number.NEGATIVE_INFINITY;

/** Records a press starting (`down`) or ending; exported for tests and the installed listeners. */
export const noteNoticeGatePress = (down: boolean, nowMs: number): void => {
  pressing = down;
  lastPressAt = nowMs;
};

/** True while a press is in progress or one ended within NOTICE_QUIET_MS. */
export const noticePressRecent = (nowMs: number): boolean => pressing || nowMs - lastPressAt < NOTICE_QUIET_MS;

/** True while an unprompted notice should wait: a modal is open or the player is tapping. */
export const noticesHeld = (doc: Document, nowMs: number): boolean => noticeModalOpen(doc) || noticePressRecent(nowMs);

let installedOn: Window | undefined;

/** Watches presses anywhere on the page (capture phase, so no control can hide one). Idempotent. */
export const installNoticeGatePressTracking = (win: Window): void => {
  if (installedOn === win) return;
  installedOn = win;
  win.addEventListener("pointerdown", () => noteNoticeGatePress(true, Date.now()), { capture: true, passive: true });
  for (const type of ["pointerup", "pointercancel"] as const) {
    win.addEventListener(type, () => noteNoticeGatePress(false, Date.now()), { capture: true, passive: true });
  }
};

/** Start-up: full-screen cards (Town Captured, ...) wait for the gate. A no-op without a page (Node tests). */
export const installNoticeGate = (): void => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installNoticeGatePressTracking(window);
  setFullscreenCardHold(() => noticesHeld(document, Date.now()));
};

/** Test-only: forgets presses. */
export const resetNoticeGateForTests = (): void => {
  pressing = false;
  lastPressAt = Number.NEGATIVE_INFINITY;
};
