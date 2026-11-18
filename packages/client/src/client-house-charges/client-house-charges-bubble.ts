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

/** Three fanned, sealed cards: parchment faces, gold edges and a red wax seal on the front one. */
const CARDS_SVG = `<svg class="hcb-cards" viewBox="-6 2 76 60" aria-hidden="true" focusable="false">
  <g stroke="#b8862f" stroke-width="1.6" stroke-linejoin="round">
    <rect x="9" y="15" width="23" height="33" rx="3" fill="#d9c49a" transform="rotate(-24 20 48)"/>
    <rect x="32" y="15" width="23" height="33" rx="3" fill="#e6d3aa" transform="rotate(24 44 48)"/>
    <rect x="20.5" y="13" width="23" height="33" rx="3" fill="#f3e5c4"/>
  </g>
  <g stroke="#b8862f" stroke-width="1.2" stroke-linecap="round" opacity="0.7">
    <line x1="25" y1="19" x2="39" y2="19"/><line x1="25" y1="23" x2="36" y2="23"/><line x1="25" y1="40" x2="39" y2="40"/>
  </g>
  <circle cx="32" cy="31.5" r="6" fill="#a8261e" stroke="#6e130d" stroke-width="1.2"/>
  <path d="M32 28.1l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#e8b04a"/>
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
