// The keep choice as a card table (owner 2026-11-19: "pick between cards"). While
// the choice is open, the Charges panel deals the House's charges as trading
// cards: they arrive face down and turn over one by one the first time the
// panel is opened for a deal, then a tap on a card keeps it or sets it aside.
// Two kept is a full hand: tapping a third swaps out the oldest pick, so the
// draft is never over the limit. The details list under the table (objective,
// letter, Show on map) is unchanged; the table replaced its Keep tick boxes.
import type { HouseChargeView } from "@border-empires/shared";
import { houseChargeCardArtSvg, houseChargeCardBackHtml } from "./client-house-charge-cards.js";
import { HOUSE_CHARGE_KIND_LABEL, HOUSE_CHARGE_RARITY_LABEL } from "./client-house-charges-labels.js";
import "./client-house-charge-cards.css";
import "./client-house-charges-pick.css";

const DEAL_KEY = "be.houseCharges.pickDealt";
/** Long enough for the last card's turn (0.25 s apart, 0.6 s each) to finish before the class goes. */
export const HOUSE_CHARGES_DEAL_MS = 1_600;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** When this deal's cards started turning over in this session; read from storage once per deal. */
let dealing: { dealtAt: number; startedAt: number | null } | undefined;

const readDealt = (): string | null => {
  try {
    return window.localStorage.getItem(DEAL_KEY);
  } catch {
    return null;
  }
};

const writeDealt = (dealtAt: number): void => {
  try {
    window.localStorage.setItem(DEAL_KEY, String(dealtAt));
  } catch {
    // Storage blocked: the cards may be dealt again after a reload, which is harmless.
  }
};

/** True while the deal's cards are turning over. The first call for an unseen deal starts the turn. */
export const houseChargesDealing = (dealtAt: number, nowMs: number): boolean => {
  if (dealing?.dealtAt !== dealtAt) {
    const seen = readDealt() === String(dealtAt);
    dealing = { dealtAt, startedAt: seen ? null : nowMs };
    if (!seen) writeDealt(dealtAt);
  }
  return dealing.startedAt !== null && nowMs - dealing.startedAt < HOUSE_CHARGES_DEAL_MS;
};

/** Test-only: forgets which deals were turned over in this session. */
export const resetHouseChargesPickForTests = (): void => {
  dealing = undefined;
};

/** The draft after a tap on `id`: set aside if kept, else kept, dropping the oldest pick when the hand is full. */
export const toggleHouseChargePick = (draft: readonly string[], id: string, wanted: number): string[] => {
  if (draft.includes(id)) return draft.filter((entry) => entry !== id);
  const next = [...draft, id];
  return next.length > wanted ? next.slice(next.length - wanted) : next;
};

/** The table's card face: the trading card cut down to what reads at a third of a phone's width. The objective,
 * letter and progress are in the details list under the table. */
const faceHtml = (charge: HouseChargeView): string => {
  const difficulty = Math.max(1, Math.min(4, charge.renown));
  return `<div class="hc-card kind-${charge.kind.toLowerCase()} rarity-${charge.rarity.toLowerCase()}">
    <div class="hc-frame">
      <div class="hc-bar"><span class="hc-name">${esc(charge.title)}</span></div>
      <div class="hc-art">${houseChargeCardArtSvg({ kind: charge.kind })}<span class="hcp-pips" aria-label="Difficulty ${difficulty} of 4">${"◆".repeat(difficulty)}</span></div>
      <div class="hc-bar hc-type"><span>${HOUSE_CHARGE_KIND_LABEL[charge.kind]}</span><span class="hc-set" title="${HOUSE_CHARGE_RARITY_LABEL[charge.rarity]}" aria-label="${HOUSE_CHARGE_RARITY_LABEL[charge.rarity]}">✦</span></div>
    </div>
  </div>`;
};

/**
 * The table: one card per charge, kept cards raised with a seal. `dealing` turns them over in sequence. No inline
 * styles: the panel re-renders when its HTML differs from the browser's serialisation, which rewrites them.
 */
export const houseChargesPickHtml = (charges: readonly HouseChargeView[], draft: readonly string[], wanted: number, dealing: boolean): string => {
  const cards = charges.map((charge) => {
    const kept = draft.includes(charge.id);
    return `<button type="button" class="hcp-slot${kept ? " is-kept" : ""}" data-house-charge-pick="${esc(charge.id)}" aria-pressed="${kept}" aria-label="${esc(charge.title)}: ${kept ? "kept. Tap to set it aside" : "set aside. Tap to keep it"}">
      <span class="hcp-flip"><span class="hcp-face">${faceHtml(charge)}</span><span class="hcp-back">${houseChargeCardBackHtml()}</span></span>
      <span class="hcp-seal" aria-hidden="true">${kept ? "Kept" : "Tap to keep"}</span>
    </button>`;
  }).join("");
  return `<div class="hcp-table${dealing ? " is-dealing" : ""}" role="group" aria-label="Tap ${wanted} cards to keep">${cards}</div>`;
};
