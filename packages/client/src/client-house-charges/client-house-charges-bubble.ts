// "Charges unhandled" bubble: while the keep choice is open and the House has
// not opened its Charges panel for this deal, an illustration of three sealed
// cards bobs at the left edge of the map, with a small speech bubble that says
// the House has sent sealed charges. Tapping the cards or the note's words opens
// the Charges panel (which handles the deal and removes the bubble); the note's
// x counts as seen too, so the cards dock (playtest 2026-11-26: the note kept
// coming back over the map and over guide targets). The words are a button of their own: when only
// the cards opened the panel, a tap on the words did nothing or was snapped onto
// the x by the phone's tap adjustment, so the note vanished (owner, 2026-11-19).
// Once the charges have been opened (or the choice has closed), the cards stay
// docked in the same place, still and smaller, with a held count, as the way
// back to the charges: the profile's Manage charges was too hard to find (owner,
// 2026-11-19). The first time an account's cards dock, they pulse once with a
// terse "Charges live here". While Show on
// map highlights a charge, the docked cards carry a "Back to cards" note with
// its title, and an x that clears the highlight (owner, 2026-11-19: pressing
// Show on map left the panel open over the map). It replaced a one-time alert card that other alerts could
// bury (owner, 2026-11-18). The flags are kept per account and deal in localStorage; a keep the server
// already confirmed also counts as seen. Taps on the bubble never reach the map or controls under it.
import { HOUSE_CHARGES_KEPT, type HouseChargeView, type HouseChargesPayload } from "@border-empires/shared";
// Shared pieces first, so the bubble's own rules come after them.
import { houseChargeCardBackHtml } from "./client-house-charge-cards.js";
import { houseChargeEmblemSvg } from "./client-house-charge-emblems.js";
import "../client-callout/client-callout.css";
import { houseChargesWithLiveNames } from "./client-house-charges-live-names.js";
import "./client-house-charge-cards.css";
import "./client-house-charges-bubble.css";

const ROOT_ID = "house-charges-bubble";
// Per account (`:<player id>`): one device-wide key let a second House on the same device overwrite the first
// House's deal, so its bubble came back (playtest 2026-11-26). The unscoped keys are read once for migration.
const HANDLED_KEY = "be.houseCharges.bubbleHandled";
const POINTER_KEY = "be.houseCharges.pointerSeen";
const LEGACY_DOCK_NOTE_KEY = "be.houseCharges.dockNoteSeen";
/** How long "Charges live here" shows, once per account, the first time the cards dock after being seen. */
export const HOUSE_CHARGES_POINTER_MS = 6_000;

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the in-memory flags still hold for this session; the bubble may come back after a reload.
  }
};

const scoped = (key: string, me: string): string => (me ? `${key}:${me}` : key);

/**
 * The server keeps the first two offered charges until the House chooses, so any other kept set is a keep
 * the House made: it has seen its charges, whatever this device's storage says.
 */
const keepChosen = (payload: HouseChargesPayload): boolean =>
  payload.charges.some((charge, index) => charge.kept !== index < HOUSE_CHARGES_KEPT);

/**
 * The flags for this account's current deal, read from storage once per deal and kept in memory, so the 250 ms
 * HUD frame never touches storage and the flags still work for the session when storage is blocked.
 */
type DealFlags = { me: string; dealtAt: number; handled: boolean; pointerSeen: boolean | undefined; pointerUntil: number };
let flags: DealFlags | undefined;

const flagsFor = (me: string, payload: HouseChargesPayload): DealFlags => {
  const { dealtAt } = payload;
  if (flags?.dealtAt !== dealtAt || flags.me !== me) {
    const handled =
      keepChosen(payload) ||
      read(scoped(HANDLED_KEY, me)) === String(dealtAt) ||
      (me !== "" && read(HANDLED_KEY) === String(dealtAt));
    flags = { me, dealtAt, handled, pointerSeen: flags?.me === me ? flags.pointerSeen : undefined, pointerUntil: 0 };
  }
  return flags;
};

/** Test-only: forgets the in-memory flags and the rendered bubble (as a reload does). */
export const resetHouseChargesBubbleForTests = (): void => {
  flags = undefined;
  lastHtml = "";
  current = undefined;
};

/** True while the House still has a keep choice to make that it has not looked at. */
export const houseChargesUnhandled = (payload: HouseChargesPayload | null | undefined, nowMs: number, me = ""): payload is HouseChargesPayload =>
  payload !== null && payload !== undefined && nowMs < payload.choiceClosesAt && payload.charges.length > HOUSE_CHARGES_KEPT && !flagsFor(me, payload).handled;

const markHandled = (me: string, payload: HouseChargesPayload): void => {
  flagsFor(me, payload).handled = true;
  write(scoped(HANDLED_KEY, me), String(payload.dealtAt));
};

/** Whether "Charges live here" shows now; the first docked frame after the charges were seen starts it, once per account. */
const pointerShowing = (me: string, payload: HouseChargesPayload, nowMs: number): boolean => {
  const deal = flagsFor(me, payload);
  if (deal.pointerSeen === undefined) deal.pointerSeen = read(scoped(POINTER_KEY, me)) !== null || read(LEGACY_DOCK_NOTE_KEY) !== null;
  if (!deal.pointerSeen) {
    deal.pointerSeen = true;
    deal.pointerUntil = nowMs + HOUSE_CHARGES_POINTER_MS;
    write(scoped(POINTER_KEY, me), "1");
  }
  return nowMs < deal.pointerUntil;
};

/** A face-down charge card: the trading card's own back (client-house-charge-cards.ts). */
const MINI_CARD = houseChargeCardBackHtml({ mini: true });

/** Three fanned, sealed charge cards. */
const CARDS_HTML = `<span class="hcb-cards" aria-hidden="true">${MINI_CARD}${MINI_CARD}${MINI_CARD}</span>`;

/** While Show on map highlights a charge, its card lies face up on top of the other two (client-house-charges-fold.ts). */
const cardsWithFaceHtml = (charge: HouseChargeView): string =>
  `<span class="hcb-cards has-face" aria-hidden="true">${MINI_CARD}<span class="hc-card is-mini is-face kind-${charge.kind.toLowerCase()}"><span class="hc-frame"><span class="hc-art">${houseChargeEmblemSvg(charge.kind)}</span></span></span>${MINI_CARD}</span>`;

const closeHtml = '<button type="button" class="hcb-speech-close" data-hcb-action="dismiss-speech" aria-label="Hide message">&times;</button>';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** While a charge is shown on the map: its title and the way back to the cards. */
const focusNoteHtml = (title: string): string => `<div class="hcb-speech hcb-focus sp-callout sp-callout-tail-left">
        <button type="button" class="hcb-speech-open" data-hcb-action="open"><span class="hcb-focus-title">Showing: ${escapeHtml(title)}</span><span class="hcb-focus-back">‹ Back to cards</span></button>
        <button type="button" class="hcb-speech-close" data-hcb-action="clear-focus" aria-label="Stop showing this charge">&times;</button>
      </div>`;

/** Whether the docked cards show the Show on map note (the focused charge is in this deal). */
const focusShown = (payload: HouseChargesPayload, focusId: string | undefined): boolean =>
  focusId !== undefined && payload.charges.some((charge) => charge.id === focusId);

/** The cards at rest once the charges have been opened: the way back to them, with how many kept charges are held. */
export const houseChargesDockHtml = (payload: HouseChargesPayload, showPointer: boolean, focusId?: string): string => {
  const kept = payload.charges.filter((charge) => charge.kept);
  const held = kept.filter((charge) => charge.held).length;
  const focused = focusShown(payload, focusId) ? payload.charges.find((charge) => charge.id === focusId) : undefined;
  const note = focused
    ? focusNoteHtml(focused.title)
    : showPointer
    ? `<div class="hcb-pointer sp-callout sp-callout-tail-left" role="status">Charges live here</div>`
    : "";
  const pointing = !focused && showPointer ? " is-pointing" : "";
  return `<button type="button" class="hcb-orb is-docked${pointing}" data-hcb-action="open" aria-label="Your House charges: ${held} of ${kept.length} held">${focused ? cardsWithFaceHtml(focused) : CARDS_HTML}<span class="hcb-badge" aria-hidden="true">${held}/${kept.length}</span></button>${note}`;
};

export const houseChargesBubbleHtml = (payload: HouseChargesPayload): string => {
  const count = payload.charges.length;
  const speech = `<div class="hcb-speech sp-callout sp-callout-tail-left" role="status">
        <button type="button" class="hcb-speech-open" data-hcb-action="open">Your House has handed you ${count} sealed charges. Keep ${HOUSE_CHARGES_KEPT}. <span class="hcb-speech-cta">See charges ›</span></button>
${closeHtml}
      </div>`;
  return `<button type="button" class="hcb-orb" data-hcb-action="open" aria-label="Open your ${count} sealed House charges">${CARDS_HTML}</button>${speech}`;
};

export type HouseChargesBubbleState = {
  /** The signed-in player's id: the seen flags are per account. */
  me?: string;
  houseCharges?: HouseChargesPayload | null | undefined;
  activePanel: string | null;
  houseChargeFocusId?: string | undefined;
  /** Names the client knows now, for a rival House on a Writ of Correction. */
  playerNames?: ReadonlyMap<string, string>;
};

let lastHtml = "";
/** What the root's single click listener acts on; refreshed every frame. */
let current: { state: HouseChargesBubbleState; payload: HouseChargesPayload; nowMs: number; overUi: boolean; openCharges: () => void; refreshMap: () => void } | undefined;

/** Input on the bubble that must never reach the map (window mouseup/mousedown, canvas touches) or a control under it. */
const SWALLOWED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"] as const;

const onBubbleClick = (ev: MouseEvent): void => {
  // The root is pointer-events: none, so only the cards and notes get here: the tap is the bubble's alone.
  ev.preventDefault();
  ev.stopPropagation();
  const action = (ev.target as Element | null)?.closest("[data-hcb-action]")?.getAttribute("data-hcb-action");
  if (!current) return;
  const { state, payload, nowMs, overUi, openCharges, refreshMap } = current;
  const me = state.me ?? "";
  if (action === "dismiss-speech") {
    markHandled(me, payload);
    syncHouseChargesBubble(state, nowMs, overUi, openCharges, refreshMap);
  } else if (action === "clear-focus") {
    state.houseChargeFocusId = undefined;
    refreshMap();
    syncHouseChargesBubble(state, nowMs, overUi, openCharges, refreshMap);
  } else if (action === "open") {
    markHandled(me, payload);
    document.getElementById(ROOT_ID)?.remove();
    lastHtml = "";
    openCharges();
  }
};

/** Docked once there is nothing new to announce: the charges were opened, or the choice is over. */
const docked = (payload: HouseChargesPayload | null | undefined, nowMs: number, me: string): payload is HouseChargesPayload =>
  payload !== null && payload !== undefined && payload.charges.length > 0 && !houseChargesUnhandled(payload, nowMs, me);

/**
 * Called from the HUD's frame. `overUi` (a screen or profile is open, or the game is not on screen) and any open
 * panel hide the bubble without handling the deal. Opening the Charges panel by any route handles it, and the
 * cards then dock.
 */
export const syncHouseChargesBubble = (
  state: HouseChargesBubbleState,
  nowMs: number,
  overUi: boolean,
  openCharges: () => void,
  refreshMap: () => void = () => {}
): void => {
  if (typeof document === "undefined") return;
  const payload = houseChargesWithLiveNames(state.houseCharges, state.playerNames);
  const me = state.me ?? "";
  // Any opening counts, also with the choice closed or nothing to choose: the pointer waits for it.
  if (payload && state.activePanel === "charges" && !flagsFor(me, payload).handled) markHandled(me, payload);
  let root = document.getElementById(ROOT_ID);
  const unhandled = houseChargesUnhandled(payload, nowMs, me);
  if (!payload || (!unhandled && !docked(payload, nowMs, me)) || overUi || state.activePanel !== null) {
    root?.remove();
    lastHtml = "";
    current = undefined;
    return;
  }
  current = { state, payload, nowMs, overUi, openCharges, refreshMap };
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "hcb-root";
    for (const type of SWALLOWED_EVENTS) root.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
    root.addEventListener("click", onBubbleClick);
    document.body.appendChild(root);
    lastHtml = "";
  }
  root.classList.toggle("is-docked", !unhandled);
  // A separate name: `unhandled` narrows `payload` itself to never in the docked branch.
  const deal: HouseChargesPayload = payload;
  const html = unhandled
    ? houseChargesBubbleHtml(deal)
    // The one-time pointer waits while the Show on map note takes its place, so it is not spent unseen.
    : houseChargesDockHtml(deal, !focusShown(deal, state.houseChargeFocusId) && flagsFor(me, deal).handled && pointerShowing(me, deal, nowMs), state.houseChargeFocusId);
  if (html !== lastHtml) {
    root.innerHTML = html;
    lastHtml = html;
  }
};
