// "Charges unhandled" bubble: while the keep choice is open and the House has
// not opened its Charges panel for this deal, an illustration of three sealed
// cards bobs at the left edge of the map, with a small speech bubble that says
// the House has sent sealed charges. Tapping the cards opens the Charges panel
// (which handles the deal and removes the bubble); the speech bubble's x hides
// just the text. It replaced a one-time alert card that other alerts could
// bury (owner, 2026-11-18). Both flags are kept per deal in localStorage.
import { HOUSE_CHARGES_KEPT, type HouseChargesPayload } from "@border-empires/shared";
// Shared pieces first, so the bubble's own rules come after them.
import { houseChargeCardBackHtml } from "./client-house-charge-cards.js";
import "../client-callout/client-callout.css";
import "./client-house-charge-cards.css";
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

/** A face-down charge card: the trading card's own back (client-house-charge-cards.ts). */
const MINI_CARD = houseChargeCardBackHtml({ mini: true });

/** Three fanned, sealed charge cards. */
const CARDS_HTML = `<span class="hcb-cards" aria-hidden="true">${MINI_CARD}${MINI_CARD}${MINI_CARD}</span>`;

export const houseChargesBubbleHtml = (payload: HouseChargesPayload, showSpeech: boolean): string => {
  const count = payload.charges.length;
  const speech = showSpeech
    ? `<div class="hcb-speech sp-callout sp-callout-tail-left" role="status">
        <p>Your House has handed you ${count} sealed charges. Keep ${HOUSE_CHARGES_KEPT}.</p>
        <button type="button" class="hcb-speech-close" data-hcb-action="dismiss-speech" aria-label="Hide message">&times;</button>
      </div>`
    : "";
  return `<button type="button" class="hcb-orb" data-hcb-action="open" aria-label="Open your ${count} sealed House charges">${CARDS_HTML}</button>${speech}`;
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
