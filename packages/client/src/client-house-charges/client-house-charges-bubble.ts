// "Charges unhandled" bubble: while the keep choice is open and the House has
// not opened its Charges panel for this deal, an illustration of three sealed
// cards bobs at the left edge of the map, with a small speech bubble that says
// the House has sent sealed charges. Tapping the cards or the note's words opens
// the Charges panel (which handles the deal and removes the bubble); the speech
// bubble's x hides just the text. The words are a button of their own: when only
// the cards opened the panel, a tap on the words did nothing or was snapped onto
// the x by the phone's tap adjustment, so the note vanished (owner, 2026-11-19).
// Once the charges have been opened (or the choice has closed), the cards stay
// docked in the same place, still and smaller, with a held count, as the way
// back to the charges: the profile's Manage charges was too hard to find (owner,
// 2026-11-19). The first time they dock, a short note says so. It replaced a one-time alert card that other alerts could
// bury (owner, 2026-11-18). The flags are kept per deal in localStorage.
import { HOUSE_CHARGES_KEPT, type HouseChargesPayload } from "@border-empires/shared";
// Shared pieces first, so the bubble's own rules come after them.
import { houseChargeCardBackHtml } from "./client-house-charge-cards.js";
import "../client-callout/client-callout.css";
import "./client-house-charge-cards.css";
import "./client-house-charges-bubble.css";

const ROOT_ID = "house-charges-bubble";
const HANDLED_KEY = "be.houseCharges.bubbleHandled";
const SPEECH_KEY = "be.houseCharges.bubbleSpeechDismissed";
const DOCK_NOTE_KEY = "be.houseCharges.dockNoteSeen";
/** How long the "your charges stay here" note shows the first time the cards dock. */
export const HOUSE_CHARGES_DOCK_NOTE_MS = 10_000;

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
    // Storage blocked: the in-memory flags still hold for this session; the bubble may come back after a reload.
  }
};

/**
 * Both flags for the current deal, read from storage once per deal and kept in memory, so the 250 ms HUD
 * frame never touches storage and the flags still work for the session when storage is blocked.
 */
type DealFlags = { dealtAt: number; handled: boolean; speechDismissed: boolean; dockNoteSeen: boolean; dockNoteUntil: number };
let flags: DealFlags | undefined;

const flagsFor = (dealtAt: number): DealFlags => {
  if (flags?.dealtAt !== dealtAt) {
    flags = {
      dealtAt,
      handled: readDeal(HANDLED_KEY) === String(dealtAt),
      speechDismissed: readDeal(SPEECH_KEY) === String(dealtAt),
      dockNoteSeen: readDeal(DOCK_NOTE_KEY) === String(dealtAt),
      dockNoteUntil: 0
    };
  }
  return flags;
};

/** Test-only: forgets the in-memory flags and the rendered bubble. */
export const resetHouseChargesBubbleForTests = (): void => {
  flags = undefined;
  lastHtml = "";
};

/** True while the House still has a keep choice to make that it has not looked at. */
export const houseChargesUnhandled = (payload: HouseChargesPayload | null | undefined, nowMs: number): payload is HouseChargesPayload =>
  payload !== null && payload !== undefined && nowMs < payload.choiceClosesAt && payload.charges.length > HOUSE_CHARGES_KEPT && !flagsFor(payload.dealtAt).handled;

export const markHouseChargesHandled = (dealtAt: number): void => {
  flagsFor(dealtAt).handled = true;
  writeDeal(HANDLED_KEY, dealtAt);
};

const dismissSpeech = (dealtAt: number): void => {
  const deal = flagsFor(dealtAt);
  deal.speechDismissed = true;
  deal.dockNoteUntil = 0;
  writeDeal(SPEECH_KEY, dealtAt);
};

/** Whether the docked cards show their one-time note now; the first docked frame after the charges were opened starts it. */
const dockNoteShowing = (dealtAt: number, nowMs: number): boolean => {
  const deal = flagsFor(dealtAt);
  if (!deal.dockNoteSeen) {
    deal.dockNoteSeen = true;
    deal.dockNoteUntil = nowMs + HOUSE_CHARGES_DOCK_NOTE_MS;
    writeDeal(DOCK_NOTE_KEY, dealtAt);
  }
  return nowMs < deal.dockNoteUntil;
};

/** A face-down charge card: the trading card's own back (client-house-charge-cards.ts). */
const MINI_CARD = houseChargeCardBackHtml({ mini: true });

/** Three fanned, sealed charge cards. */
const CARDS_HTML = `<span class="hcb-cards" aria-hidden="true">${MINI_CARD}${MINI_CARD}${MINI_CARD}</span>`;

const closeHtml = '<button type="button" class="hcb-speech-close" data-hcb-action="dismiss-speech" aria-label="Hide message">&times;</button>';

/** The cards at rest once the charges have been opened: the way back to them, with how many kept charges are held. */
export const houseChargesDockHtml = (payload: HouseChargesPayload, showNote: boolean): string => {
  const kept = payload.charges.filter((charge) => charge.kept);
  const held = kept.filter((charge) => charge.held).length;
  const note = showNote
    ? `<div class="hcb-speech sp-callout sp-callout-tail-left" role="status">
        <button type="button" class="hcb-speech-open" data-hcb-action="open">Your charges stay here. Tap the cards to see them again.</button>${closeHtml}
      </div>`
    : "";
  return `<button type="button" class="hcb-orb is-docked" data-hcb-action="open" aria-label="Your House charges: ${held} of ${kept.length} held">${CARDS_HTML}<span class="hcb-badge" aria-hidden="true">${held}/${kept.length}</span></button>${note}`;
};

export const houseChargesBubbleHtml = (payload: HouseChargesPayload, showSpeech: boolean): string => {
  const count = payload.charges.length;
  const speech = showSpeech
    ? `<div class="hcb-speech sp-callout sp-callout-tail-left" role="status">
        <button type="button" class="hcb-speech-open" data-hcb-action="open">Your House has handed you ${count} sealed charges. Keep ${HOUSE_CHARGES_KEPT}. <span class="hcb-speech-cta">See charges ›</span></button>
${closeHtml}
      </div>`
    : "";
  return `<button type="button" class="hcb-orb" data-hcb-action="open" aria-label="Open your ${count} sealed House charges">${CARDS_HTML}</button>${speech}`;
};

export type HouseChargesBubbleState = {
  houseCharges?: HouseChargesPayload | null | undefined;
  activePanel: string | null;
};

let lastHtml = "";
/** What the root's single click listener acts on; refreshed every frame. */
let current: { state: HouseChargesBubbleState; payload: HouseChargesPayload; nowMs: number; overUi: boolean; openCharges: () => void } | undefined;

const onBubbleClick = (ev: MouseEvent): void => {
  const action = (ev.target as Element | null)?.closest("[data-hcb-action]")?.getAttribute("data-hcb-action");
  if (!current) return;
  const { state, payload, nowMs, overUi, openCharges } = current;
  if (action === "dismiss-speech") {
    dismissSpeech(payload.dealtAt);
    syncHouseChargesBubble(state, nowMs, overUi, openCharges);
  } else if (action === "open") {
    markHouseChargesHandled(payload.dealtAt);
    document.getElementById(ROOT_ID)?.remove();
    lastHtml = "";
    openCharges();
  }
};

/** Docked once there is nothing new to announce: the charges were opened, or the choice is over. */
const docked = (payload: HouseChargesPayload | null | undefined, nowMs: number): payload is HouseChargesPayload =>
  payload !== null && payload !== undefined && payload.charges.length > 0 && !houseChargesUnhandled(payload, nowMs);

/**
 * Called from the HUD's frame. `overUi` (a screen or profile is open, or the game is not on screen) and any open
 * panel hide the bubble without handling the deal. Opening the Charges panel by any route handles it, and the
 * cards then dock.
 */
export const syncHouseChargesBubble = (state: HouseChargesBubbleState, nowMs: number, overUi: boolean, openCharges: () => void): void => {
  if (typeof document === "undefined") return;
  const payload = state.houseCharges;
  // Any opening counts, also with the choice closed or nothing to choose: the dock note waits for it.
  if (payload && state.activePanel === "charges" && !flagsFor(payload.dealtAt).handled) markHouseChargesHandled(payload.dealtAt);
  let root = document.getElementById(ROOT_ID);
  const unhandled = houseChargesUnhandled(payload, nowMs);
  if (!payload || (!unhandled && !docked(payload, nowMs)) || overUi || state.activePanel !== null) {
    root?.remove();
    lastHtml = "";
    current = undefined;
    return;
  }
  current = { state, payload, nowMs, overUi, openCharges };
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "hcb-root";
    root.addEventListener("click", onBubbleClick);
    document.body.appendChild(root);
    lastHtml = "";
  }
  root.classList.toggle("is-docked", !unhandled);
  // A separate name: `unhandled` narrows `payload` itself to never in the docked branch.
  const deal: HouseChargesPayload = payload;
  const html = unhandled
    ? houseChargesBubbleHtml(deal, !flagsFor(deal.dealtAt).speechDismissed)
    : houseChargesDockHtml(deal, flagsFor(deal.dealtAt).handled && dockNoteShowing(deal.dealtAt, nowMs));
  if (html !== lastHtml) {
    root.innerHTML = html;
    lastHtml = html;
  }
};
