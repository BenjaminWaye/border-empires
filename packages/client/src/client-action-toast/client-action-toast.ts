// A short line at the top of the screen when the server confirms something the
// player did: a deal agreed, a build started, land claimed (first-15 playtest
// round 1: "no 'Tove accepted!' moment", "Build Hydrogarden closed with no
// confirmation", "didn't know whether the tile was claimed"). Not the alert
// card: good news never takes the card (owner call 2026-11-27, showCaptureAlert).
// It doesn't take taps, sits clear of the map's middle and fades on its own.
// Callers raise it only on a server message, never when the order is sent.
import "./client-action-toast.css";

/** How long a confirmation stays up. */
export const ACTION_TOAST_MS = 2_500;

const TOAST_ID = "action-toast";
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows `text`, replacing any confirmation already up. A no-op without a DOM (tests, workers). */
export const showActionToast = (text: string, doc: Document | undefined = globalThis.document): void => {
  if (!doc?.body || !text.trim()) return;
  let toast = doc.getElementById(TOAST_ID);
  if (!toast) {
    toast = doc.createElement("div");
    toast.id = TOAST_ID;
    toast.className = "action-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    doc.body.append(toast);
  }
  toast.textContent = text;
  toast.classList.add("is-visible");
  if (hideTimer) clearTimeout(hideTimer);
  const shown = toast;
  hideTimer = setTimeout(() => {
    hideTimer = undefined;
    shown.classList.remove("is-visible");
  }, ACTION_TOAST_MS);
};

/** "Bryn accepted your 12h truce." from an announcement that goes on with the AI's reason. */
export const firstSentence = (text: string): string => {
  const end = text.search(/[.!?](\s|$)/);
  return end < 0 ? text.trim() : text.slice(0, end + 1).trim();
};
