// The Charges panel's cards (owner 2026-11-19: "put the description on the
// cards"). Each charge is one full-width trading card the player scrolls
// through: title and difficulty, art, type and rarity, then
// the objective (a kept card also shows the Domain score it banks if held at the
// crowning), the House's reason for the charge, progress and status, with
// Keep and Show on map on the card itself. Replaces the separate card table and
// details list.
import { houseChargeDomain, houseChargePips, type HouseChargeView } from "@border-empires/shared";
import { houseChargeCardArtSvg, houseChargeCardBackHtml } from "./client-house-charge-cards.js";
import { HOUSE_CHARGE_KIND_LABEL, HOUSE_CHARGE_RARITY_LABEL, houseChargeLetter, houseChargeObjective, houseChargeProgress } from "./client-house-charges-labels.js";
import "./client-house-charge-cards.css";
import "./client-house-charges-deck.css";
import "./client-house-charges-deck-motion.css";

export type HouseChargeDeckCardOptions = {
  /** The keep choice is open: the card carries a Keep button. */
  readonly choosing: boolean;
  /** Kept in the player's current draft (while choosing). */
  readonly ticked: boolean;
  /** Highlighted on the map: Show on map reads Hide on map. */
  readonly focused: boolean;
  readonly scoutHint: string | undefined;
  readonly formatWhen: (epochMs: number) => string;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const statusHtml = (charge: HouseChargeView, options: HouseChargeDeckCardOptions): string => {
  const { choosing, ticked, formatWhen } = options;
  // While choosing, the status follows the draft so a swap reads at a glance before it is saved.
  if (choosing && ticked !== charge.kept) return `<p class="hcd-status is-pending">${ticked ? "Will be kept" : "Will be dropped"}</p>`;
  if (!charge.kept && !choosing) return '<p class="hcd-status is-dropped">Not kept</p>';
  if (charge.held) return `<p class="hcd-status is-held">Held${charge.completeSince ? ` since ${esc(formatWhen(charge.completeSince))}` : ""}</p>`;
  if (!charge.kept) return "";
  return charge.lostAt !== undefined ? `<p class="hcd-status is-lost">Lost ${esc(formatWhen(charge.lostAt))}</p>` : '<p class="hcd-status">Not held</p>';
};

/** One charge as a full-width card. Keep uses `data-house-charge-pick`, Show on map `data-house-charge-jump`. */
export const houseChargeDeckCardHtml = (charge: HouseChargeView, options: HouseChargeDeckCardOptions): string => {
  const { choosing, ticked, focused, scoutHint } = options;
  // `renown` is the charge's difficulty pips, scored when it is dealt (house-charge-difficulty.ts); each pip banks +1 Domain (older charges: by rarity).
  const difficulty = houseChargePips(charge.renown);
  const domain = houseChargeDomain(charge);
  const kept = choosing ? ticked : charge.kept;
  const progress = houseChargeProgress(charge);
  const keep = choosing
    ? `<button type="button" class="hcd-keep${ticked ? " is-kept" : ""}" data-house-charge-pick="${esc(charge.id)}" aria-pressed="${ticked}" aria-label="${esc(charge.title)}: ${ticked ? "kept. Tap to set it aside" : "set aside. Tap to keep it"}">${ticked ? "✦ Kept" : "Tap to keep"}</button>`
    : "";
  return `<article class="hc-card hcd-card kind-${charge.kind.toLowerCase()} rarity-${charge.rarity.toLowerCase()}${kept ? " is-kept" : " is-unkept"}">
    <div class="hc-frame">
      <div class="hc-bar"><span class="hc-name">${esc(charge.title)}</span><span class="hc-pips" title="Difficulty ${difficulty} of 4" aria-label="Difficulty ${difficulty} of 4">${"◆".repeat(difficulty)}</span></div>
      <div class="hc-art">${houseChargeCardArtSvg({ kind: charge.kind })}</div>
      <div class="hc-bar hc-type"><span>${HOUSE_CHARGE_KIND_LABEL[charge.kind]}</span><span class="hcd-reward">✦ ${HOUSE_CHARGE_RARITY_LABEL[charge.rarity]}${kept ? ` · +${domain} Domain` : ""}</span></div>
      <div class="hc-text">
        <p class="hcd-objective">${esc(houseChargeObjective(charge))}</p>
        <p class="hc-flavour">“${esc(houseChargeLetter(charge))}”</p>
        ${progress ? `<p class="hcd-progress">${esc(progress)}</p>` : ""}
        ${scoutHint ? `<p class="hcd-progress is-scout">${esc(scoutHint)}</p>` : ""}
        ${statusHtml(charge, options)}
      </div>
      <div class="hcd-foot">${keep}<button class="hcd-map${focused ? " is-active" : ""}" type="button" data-house-charge-jump="${esc(charge.id)}" aria-pressed="${focused}">${focused ? "Hide on map" : "Show on map"}</button></div>
    </div>
    <div class="hcd-back" aria-hidden="true">${houseChargeCardBackHtml()}</div>
  </article>`;
};

/** How long the draw from the deck runs when the panel opens (the last card's delay plus its turn). */
export const HOUSE_CHARGES_DRAW_MS = 1_200;

/** The House's charges as a scrolling column of cards; `dealing` draws them from the deck one by one and turns them over. */
export const houseChargesDeckHtml = (cards: readonly string[], dealing: boolean): string =>
  `<div class="hcd-deck${dealing ? " is-dealing" : ""}">${cards.join("")}</div>`;
