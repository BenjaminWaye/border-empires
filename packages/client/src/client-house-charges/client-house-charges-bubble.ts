// "Charges unhandled" bubble: while the keep choice is open and the House has
// not opened its Charges panel for this deal, an illustration of three sealed
// cards bobs at the left edge of the map, with a small speech bubble that says
// the House has sent sealed charges. Tapping the cards opens the Charges panel
// (which handles the deal and removes the bubble); the speech bubble's x hides
// just the text. It replaced a one-time alert card that other alerts could
// bury (owner, 2026-11-18). Both flags are kept per deal in localStorage.
import { HOUSE_CHARGES_KEPT, type HouseChargesPayload } from "@border-empires/shared";
import "./client-house-charges-bubble.css";

const ROOT_ID = "house-charges-bubble";
const HANDLED_KEY = "be.houseCharges.bubbleHandled";
const SPEECH_KEY = "be.houseCharges.bubbleSpeechDismissed";

const readDeal = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeDeal = (key: string, dealtAt: number): void => {
  try {
    window.localStorage.setItem(key, String(dealtAt));
  } catch {
    // Storage blocked: the bubble may come back on reload, which is harmless.
  }
};

/** True while the House still has a keep choice to make that it has not looked at. */
export const houseChargesUnhandled = (payload: HouseChargesPayload | null | undefined, nowMs: number): payload is HouseChargesPayload =>
  Boolean(payload) &&
  nowMs < payload!.choiceClosesAt &&
  payload!.charges.length > HOUSE_CHARGES_KEPT &&
  readDeal(HANDLED_KEY) !== String(payload!.dealtAt);

export const markHouseChargesHandled = (dealtAt: number): void => writeDeal(HANDLED_KEY, dealtAt);

/**
 * Three fanned, sealed charge cards drawn like the trading cards (client-house-charge-cards.css): near-black
 * rim, bronze hatched frame (the Charter colours) and parchment bars, with a red wax seal on the front card.
 * The cards have no back design, so the sealed face uses the card frame.
 */
const CARDS_SVG = `<svg class="hcb-cards" viewBox="-6 2 76 60" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="hcb-frame" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="#c99158"/><stop offset="0.45" stop-color="#8a5a2b"/><stop offset="1" stop-color="#4a2d14"/></linearGradient>
    <pattern id="hcb-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="4" fill="rgba(255,255,255,0.08)"/></pattern>
  </defs>
    <g transform="rotate(-24 20 48)">
      <rect x="9" y="13" width="23" height="33" rx="3" fill="#0f0d0a"/>
      <rect x="10.8" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-frame)"/>
      <rect x="10.8" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-hatch)"/>
      <rect x="12.4" y="16.6" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
      <rect x="12.4" y="38.4" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
    </g>
    <g transform="rotate(24 44 48)">
      <rect x="32" y="13" width="23" height="33" rx="3" fill="#0f0d0a"/>
      <rect x="33.8" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-frame)"/>
      <rect x="33.8" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-hatch)"/>
      <rect x="35.4" y="16.6" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
      <rect x="35.4" y="38.4" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
    </g>
    <g>
      <rect x="20.5" y="13" width="23" height="33" rx="3" fill="#0f0d0a"/>
      <rect x="22.3" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-frame)"/>
      <rect x="22.3" y="14.8" width="19.4" height="29.4" rx="1.6" fill="url(#hcb-hatch)"/>
      <rect x="23.9" y="16.6" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
      <rect x="23.9" y="38.4" width="16.2" height="4" rx="1" fill="#ecdfc0"/>
    </g>
  <circle cx="32" cy="29.5" r="6" fill="#a8261e" stroke="#6e130d" stroke-width="1.2"/>
  <path d="M32 26.1l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#e8b04a"/>
</svg>`;

export const houseChargesBubbleHtml = (payload: HouseChargesPayload, showSpeech: boolean): string => {
  const count = payload.charges.length;
  const speech = showSpeech
    ? `<div class="hcb-speech" role="status">
        <p>Your House has handed you ${count} sealed charges. Keep ${HOUSE_CHARGES_KEPT}.</p>
        <button type="button" class="hcb-speech-close" data-hcb-action="dismiss-speech" aria-label="Hide message">&times;</button>
      </div>`
    : "";
  return `<button type="button" class="hcb-orb" data-hcb-action="open" aria-label="Open your ${count} sealed House charges">${CARDS_SVG}</button>${speech}`;
};

export type HouseChargesBubbleState = {
  houseCharges?: HouseChargesPayload | null | undefined;
  activePanel: string | null;
};

let lastHtml = "";

/**
 * Called from the HUD's frame. `overUi` (a screen or profile is open) hides the bubble without handling the
 * deal. Opening the Charges panel by any route handles it.
 */
export const syncHouseChargesBubble = (state: HouseChargesBubbleState, nowMs: number, overUi: boolean, openCharges: () => void): void => {
  if (typeof document === "undefined") return;
  const payload = state.houseCharges;
  if (payload && state.activePanel === "charges" && houseChargesUnhandled(payload, nowMs)) markHouseChargesHandled(payload.dealtAt);
  let root = document.getElementById(ROOT_ID);
  if (!houseChargesUnhandled(payload, nowMs) || overUi || state.activePanel !== null) {
    root?.remove();
    lastHtml = "";
    return;
  }
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "hcb-root";
    document.body.appendChild(root);
    lastHtml = "";
  }
  root.onclick = (ev) => {
    const action = (ev.target as Element | null)?.closest("[data-hcb-action]")?.getAttribute("data-hcb-action");
    if (action === "dismiss-speech") {
      writeDeal(SPEECH_KEY, payload.dealtAt);
      syncHouseChargesBubble(state, Date.now(), overUi, openCharges);
    } else if (action === "open") {
      markHouseChargesHandled(payload.dealtAt);
      root?.remove();
      lastHtml = "";
      openCharges();
    }
  };
  const html = houseChargesBubbleHtml(payload, readDeal(SPEECH_KEY) !== String(payload.dealtAt));
  if (html !== lastHtml) {
    root.innerHTML = html;
    lastHtml = html;
  }
};
