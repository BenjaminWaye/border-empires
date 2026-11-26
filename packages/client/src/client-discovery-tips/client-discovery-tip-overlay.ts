// Discovery tips ("first town seen", "first contact", ...) as "!" pins on the map, at the tile each tip is
// about (client-map-tip-pins.ts draws them over both renderers). Tapping a pin opens the tip's card. Players
// found the old card, which opened on its own over the bottom of the screen, got in the way of play (owner,
// 2026-11-21). A tip with no tile goes straight to the Chronicle. Every tip shown is recorded there through
// `onShow`, so it can be re-read once it is dismissed.

import type { DiscoveryTipDef, DiscoveryTipId } from "./client-discovery-tips.js";
import type { DiscoveryTipTarget } from "./client-discovery-tips.js";
import { DISCOVERY_TIPS, dismissDiscoveryTip, enqueueDiscoveryTip, getDiscoveryTipTarget } from "./client-discovery-tips.js";
import { isDiscoveryTipsMuted, markDiscoveryTipSeen } from "./client-discovery-tips-storage.js";

const OVERLAY_ID = "discovery-tip-overlay";

/** A queued tip on the map: tapping its pin opens the card. */
export type DiscoveryTipPin = { id: DiscoveryTipId; x: number; y: number };

type PinSource = { queue: DiscoveryTipId[]; authEmail: string | null | undefined; onDismiss: () => void; held: (id: DiscoveryTipId) => boolean };

let pins: DiscoveryTipPin[] = [];
let source: PinSource | undefined;
let openTipId: DiscoveryTipId | null = null;
// Tips already recorded through onShow; a finite id union, and an id leaves once its tip is dismissed.
const announced = new Set<DiscoveryTipId>();
let centerOnTarget: ((target: DiscoveryTipTarget) => void) | undefined;

/** Registers how "Show me" style links move the camera (wired once at bootstrap). */
export const setDiscoveryTipCenterHandler = (handler: ((target: DiscoveryTipTarget) => void) | undefined): void => {
  centerOnTarget = handler;
};

/** Moves the camera to `target` (the tutorial guide's "Show me" uses this). */
export const centerCameraOnDiscoveryTarget = (target: DiscoveryTipTarget): void => centerOnTarget?.(target);

/** The pins to draw this frame: queued tips with a tile, not muted, deferred or held. */
export const discoveryTipPins = (): readonly DiscoveryTipPin[] => {
  // A tip another path took out of the queue (a waystation's activation retires its tip) loses its pin at once.
  const queue = source?.queue;
  return queue && pins.some((pin) => !queue.includes(pin.id)) ? pins.filter((pin) => queue.includes(pin.id)) : pins;
};

const removeDiscoveryTipOverlay = (): void => {
  document.getElementById(OVERLAY_ID)?.remove();
  openTipId = null;
};

const showDiscoveryTipCard = (def: DiscoveryTipDef, onDismiss: (mute: boolean) => void): void => {
  removeDiscoveryTipOverlay();
  injectStyles();
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", def.title);
  overlay.innerHTML = `
    <button id="discovery-tip-close" type="button" aria-label="Dismiss">&times;</button>
    <div id="discovery-tip-title">${escapeHtml(def.title)}</div>
    <p id="discovery-tip-body">${escapeHtml(def.body)}</p>
    <label id="discovery-tip-mute-row"><input type="checkbox" class="sp-check" id="discovery-tip-mute" /> Don't show tips</label>
    <div id="discovery-tip-actions"><button id="discovery-tip-ack" type="button">Got it</button></div>`;
  document.body.appendChild(overlay);
  openTipId = def.id;
  const dismiss = (): void => {
    const mute = (overlay.querySelector("#discovery-tip-mute") as HTMLInputElement | null)?.checked === true;
    overlay.remove();
    openTipId = null;
    onDismiss(mute);
  };
  overlay.querySelector("#discovery-tip-close")?.addEventListener("click", dismiss);
  overlay.querySelector("#discovery-tip-ack")?.addEventListener("click", dismiss);
  (overlay.querySelector("#discovery-tip-ack") as HTMLButtonElement | null)?.focus();
};

/** Opens the card for a pinned tip (a pin tap). Got it or ✕ dismisses that tip and removes its pin. */
export const openDiscoveryTipPin = (id: DiscoveryTipId): void => {
  const from = source;
  if (!from || !from.queue.includes(id)) return;
  showDiscoveryTipCard(DISCOVERY_TIPS[id], (mute) => {
    dismissDiscoveryTip(from.queue, id, from.authEmail, mute);
    announced.delete(id);
    // "Don't show tips" takes every other pin off the map at once, not on the next tile batch.
    refreshPins(from, from.held, isDiscoveryTipsMuted(from.authEmail));
    from.onDismiss();
  });
};

const refreshPins = (from: PinSource, held: (id: DiscoveryTipId) => boolean, hidden: boolean): void => {
  pins = hidden ? [] : from.queue.flatMap((id) => {
    const target = held(id) ? undefined : getDiscoveryTipTarget(id);
    return target ? [{ id, x: target.x, y: target.y }] : [];
  });
  if (openTipId !== null && (hidden || !from.queue.includes(openTipId))) removeDiscoveryTipOverlay();
};

/**
 * Call on every HUD render with the current queue. Each queued tip with a tile becomes a pin. Each tip
 * without one is recorded and dismissed at once, so it is never lost and never blocks the map. `onShow`
 * fires once per tip, when its pin first appears, and records it in the Chronicle. While `deferred`
 * (client-onboarding-ui-gate.ts: a dialog covers the map, the join-time AFC drop is still landing, or the
 * tutorial guide is holding tips) no pins show and the queue is kept. Tips `held` returns true for wait in the
 * queue unpinned (the tutorial guide holds all but urgent tips). Muting clears the pins.
 */
export const renderDiscoveryTipOverlay = (
  queue: DiscoveryTipId[],
  authEmail: string | null | undefined,
  onDismiss: () => void,
  onShow?: (def: DiscoveryTipDef) => void,
  deferred = false,
  held: (id: DiscoveryTipId) => boolean = () => false
): void => {
  source = { queue, authEmail, onDismiss, held };
  const muted = isDiscoveryTipsMuted(authEmail);
  if (!muted && !deferred) {
    for (const id of [...queue]) {
      if (held(id)) continue;
      if (getDiscoveryTipTarget(id)) {
        if (!announced.has(id)) {
          announced.add(id);
          onShow?.(DISCOVERY_TIPS[id]);
          // Recorded in the Chronicle now, so a pin left untapped is not queued and recorded again next session.
          markDiscoveryTipSeen(id, authEmail);
        }
        continue;
      }
      onShow?.(DISCOVERY_TIPS[id]);
      dismissDiscoveryTip(queue, id, authEmail);
      announced.delete(id);
    }
  }
  refreshPins(source, held, muted || deferred);
};

/** Enqueues a tip triggered by a player action (rather than a newly-seen tile) and pins it at once, instead of waiting for the next tile-delta batch to trigger a render. */
export const announceDiscoveryTip = (
  queue: DiscoveryTipId[],
  id: DiscoveryTipId,
  authEmail: string | null | undefined,
  onDismiss: () => void,
  onShow?: (def: DiscoveryTipDef) => void,
  deferred = false,
  target?: DiscoveryTipTarget,
  held?: (id: DiscoveryTipId) => boolean
): void => {
  if (enqueueDiscoveryTip(queue, id, authEmail, target)) renderDiscoveryTipOverlay(queue, authEmail, onDismiss, onShow, deferred, held);
};

/** Test-only: forgets the pins, the open card and which tips were recorded. */
export const resetDiscoveryTipPinsForTests = (): void => {
  pins = [];
  source = undefined;
  announced.clear();
  removeDiscoveryTipOverlay();
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

// Steampunk reskin, pass 4 gap fix #4: this small floating card injects its
// own inline <style> at runtime (rather than living in style.css), so per
// the established convention from prior passes it's reskinned in place here
// -- brass/copper/verdigris/parchment tokens matching client-steampunk-
// theme-style.css, Cinzel for the title, Spectral for body copy.
const styles = `
#discovery-tip-overlay {
  position: fixed; right: 16px; bottom: 16px; z-index: 30;
  width: min(320px, calc(100vw - 32px)); padding: 14px 16px;
  border-radius: 6px; border: 1px solid #8a611f;
  background: linear-gradient(175deg, rgba(43, 32, 21, 0.98), rgba(20, 16, 10, 0.99));
  box-shadow: 0 18px 48px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(217, 173, 82, 0.12);
  color: #f2e8d3;
  font-family: "Spectral", "Segoe UI", system-ui, serif;
  animation: discoveryTipEnter 0.35s cubic-bezier(0.16,1,0.3,1) both;
}
#discovery-tip-close {
  position: absolute; top: 8px; right: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 999px; border: 1px solid rgba(217, 173, 82, 0.4);
  background: rgba(20,16,10,0.6); color: #f2e8d3; font-size: 12px; font-weight: 800; line-height: 1;
  cursor: pointer;
}
#discovery-tip-close:hover { background: rgba(60,41,25,0.8); }
#discovery-tip-title { font-family: "Cinzel", "Spectral", Georgia, serif; font-size: 14px; font-weight: 700; letter-spacing: 0.01em; padding-right: 20px; margin-bottom: 6px; color: #f4dfa6; }
#discovery-tip-body { font-size: 12.5px; line-height: 1.5; color: rgba(230, 214, 174, 0.9); margin: 0 0 10px; }
#discovery-tip-mute-row {
  display: flex; align-items: center; gap: 6px; margin: 0 0 10px;
  font-size: 11.5px; color: #bda880; cursor: pointer; user-select: none;
}
#discovery-tip-mute-row input { accent-color: #d9ad52; cursor: pointer; }
#discovery-tip-actions { display: flex; gap: 8px; }
#discovery-tip-ack {
  padding: 7px 14px; border-radius: 4px; border: 1px solid #8a611f;
  background: linear-gradient(180deg, rgba(90, 61, 32, 0.95), rgba(40, 28, 16, 0.96));
  color: #e6d6ae; font-family: "Spectral", "Segoe UI", system-ui, serif; font-size: 12.5px; font-weight: 700; cursor: pointer;
}
#discovery-tip-ack:hover { background: linear-gradient(180deg, rgba(184, 134, 47, 0.55), rgba(90, 61, 32, 0.6)); border-color: #f4dfa6; }
@keyframes discoveryTipEnter {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (max-width: 520px) {
  #discovery-tip-overlay { right: 10px; bottom: 10px; left: 10px; width: auto; }
}`;
