// Small dismissible corner toast for "first discovery" tips (first town
// seen, first resource of a kind seen). Modeled after the lightweight
// integrity-warning-tip pattern (not the full-modal town-capture overlay) —
// non-blocking, auto-positioned, one at a time.

import type { DiscoveryTipDef, DiscoveryTipId } from "./client-discovery-tips.js";
import { DISCOVERY_TIPS, dismissActiveDiscoveryTip, enqueueDiscoveryTip } from "./client-discovery-tips.js";
import { isDiscoveryTipsMuted } from "./client-discovery-tips-storage.js";

const OVERLAY_ID = "discovery-tip-overlay";

let currentOverlayTipId: DiscoveryTipId | null = null;

const removeDiscoveryTipOverlay = (): void => {
  document.getElementById(OVERLAY_ID)?.remove();
};

const showDiscoveryTipToast = (def: DiscoveryTipDef, onDismiss: (mute: boolean) => void): void => {
  removeDiscoveryTipOverlay();
  injectStyles();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "status");
  overlay.innerHTML = `
    <button id="discovery-tip-close" type="button" aria-label="Dismiss">&times;</button>
    <div id="discovery-tip-title">${escapeHtml(def.title)}</div>
    <p id="discovery-tip-body">${escapeHtml(def.body)}</p>
    <label id="discovery-tip-mute-row"><input type="checkbox" id="discovery-tip-mute" /> Don't show tooltips</label>
    <button id="discovery-tip-ack" type="button">Got it</button>`;
  document.body.appendChild(overlay);

  const dismiss = (): void => {
    const mute = (overlay.querySelector("#discovery-tip-mute") as HTMLInputElement | null)?.checked === true;
    overlay.remove();
    onDismiss(mute);
  };
  overlay.querySelector("#discovery-tip-close")?.addEventListener("click", dismiss);
  overlay.querySelector("#discovery-tip-ack")?.addEventListener("click", dismiss);
};

/**
 * Call on every HUD render with the current queue. Shows a toast for the
 * front of the queue if not already showing one for that id (and the player
 * hasn't checked "Don't show tooltips"); no-ops otherwise. `onDismiss` is
 * invoked after the dismissed tip is popped and persisted, so callers can
 * trigger a re-render for the next item. `onShow`, if given, fires once when
 * a tip is first displayed (not on every re-render) — callers use this to
 * also record the tip into the Activity Feed, so the player can scroll back
 * and re-read it after the toast is gone, instead of it being lost the
 * moment it's dismissed.
 */
export const renderDiscoveryTipOverlay = (
  queue: DiscoveryTipId[],
  authEmail: string | null | undefined,
  onDismiss: () => void,
  onShow?: (def: DiscoveryTipDef) => void
): void => {
  const nextId = queue[0];
  if (!nextId || isDiscoveryTipsMuted(authEmail)) {
    if (currentOverlayTipId !== null) {
      removeDiscoveryTipOverlay();
      currentOverlayTipId = null;
    }
    return;
  }
  if (currentOverlayTipId === nextId) return;
  currentOverlayTipId = nextId;
  const def = DISCOVERY_TIPS[nextId];
  onShow?.(def);
  showDiscoveryTipToast(def, (mute) => {
    dismissActiveDiscoveryTip(queue, authEmail, mute);
    currentOverlayTipId = null;
    onDismiss();
  });
};

/** Enqueues a tip triggered by a player action (rather than a newly-seen tile) and renders it immediately, instead of waiting for the next tile-delta batch to trigger a render. */
export const announceDiscoveryTip = (
  queue: DiscoveryTipId[],
  id: DiscoveryTipId,
  authEmail: string | null | undefined,
  onDismiss: () => void,
  onShow?: (def: DiscoveryTipDef) => void
): void => {
  if (enqueueDiscoveryTip(queue, id, authEmail)) renderDiscoveryTipOverlay(queue, authEmail, onDismiss, onShow);
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

let injected = false;
const injectStyles = (): void => {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = styles;
  document.head.appendChild(style);
};

const styles = `
#discovery-tip-overlay {
  position: fixed; right: 16px; bottom: 16px; z-index: 30;
  width: min(320px, calc(100vw - 32px)); padding: 14px 16px;
  border-radius: 14px; border: 1px solid rgba(230, 178, 106, 0.32);
  background: linear-gradient(180deg, rgba(24,17,10,0.98), rgba(14,10,6,0.98));
  box-shadow: 0 18px 48px rgba(0,0,0,0.45), 0 0 40px rgba(214,150,68,0.12);
  color: #fbf3e6;
  animation: discoveryTipEnter 0.35s cubic-bezier(0.16,1,0.3,1) both;
}
#discovery-tip-close {
  position: absolute; top: 8px; right: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 999px; border: 1px solid rgba(255,224,180,0.35);
  background: rgba(20,13,6,0.5); color: #fbf3e6; font-size: 12px; font-weight: 800; line-height: 1;
  cursor: pointer;
}
#discovery-tip-close:hover { background: rgba(30,20,10,0.75); }
#discovery-tip-title { font-size: 14px; font-weight: 800; letter-spacing: -0.01em; padding-right: 20px; margin-bottom: 6px; color: #ffd68f; }
#discovery-tip-body { font-size: 12.5px; line-height: 1.5; color: rgba(240,224,200,0.86); margin: 0 0 10px; }
#discovery-tip-mute-row {
  display: flex; align-items: center; gap: 6px; margin: 0 0 10px;
  font-size: 11.5px; color: rgba(230, 214, 195, 0.7); cursor: pointer; user-select: none;
}
#discovery-tip-mute-row input { accent-color: #d69644; cursor: pointer; }
#discovery-tip-ack {
  padding: 7px 14px; border-radius: 10px; border: 1px solid rgba(255,214,148,0.5);
  background: linear-gradient(180deg, rgba(255,214,148,0.22), rgba(214,150,68,0.14));
  color: #ffe6b8; font-size: 12.5px; font-weight: 800; cursor: pointer;
}
#discovery-tip-ack:hover { background: linear-gradient(180deg, rgba(255,214,148,0.32), rgba(214,150,68,0.22)); }
@keyframes discoveryTipEnter {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (max-width: 520px) {
  #discovery-tip-overlay { right: 10px; bottom: 10px; left: 10px; width: auto; }
}`;
