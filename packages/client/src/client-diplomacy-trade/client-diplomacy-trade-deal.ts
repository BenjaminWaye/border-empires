// The middle column of the diplomacy trade screen: only what is in the deal
// right now -- the treaty (if any), what you give and what they give -- each
// with a ✕ to take it out again. Also decides what kind of offer the deal is:
// a truce or alliance when one is picked, otherwise a resource trade, or a
// gift when you only give an AI coin/Shards.
import { diplomacyTermsAreEmpty, hasResourceSupplyOffer, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";

import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import { TRADE_GOODS, tradeAmount, type TradeSide } from "./client-diplomacy-trade-goods.js";
import type { TradeKind, TradeSelection, TradeVerdict } from "./client-diplomacy-trade-view.js";

/** A truce or alliance picked from the left column, or none. */
export type DealTreaty = DiplomacyOfferKind | undefined;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const asksAnything = (terms: DiplomacyTerms): boolean => terms.ask.gold > 0 || terms.ask.shard > 0 || hasResourceSupplyOffer(terms.ask.resources);

const hasSupply = (terms: DiplomacyTerms): boolean => hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources);

/**
 * The offer this deal sends. With no treaty: resource supply (or anything
 * asked for) makes it a resource trade; giving an AI only coin/Shards is a
 * gift. Humans take no gifts, so that is a (not yet sendable) trade for them.
 */
export const dealKind = (treaty: DealTreaty, terms: DiplomacyTerms, targetIsAi: boolean): TradeKind =>
  treaty ?? (hasSupply(terms) || asksAnything(terms) || !targetIsAi ? "trade" : "gift");

/** Treaty-less trade/gift verdicts that the shared verdict words for a different screen. */
export const dealVerdictOverride = (treaty: DealTreaty, kind: TradeKind, terms: DiplomacyTerms, sendLabel: string): TradeVerdict | undefined => {
  if (treaty) return undefined;
  if (diplomacyTermsAreEmpty(terms)) {
    return { tone: "neutral", text: "Pick a truce or alliance on the left, or add goods from either side.", canSend: false, sendLabel: "Send offer" };
  }
  if (!hasSupply(terms) && kind !== "gift") {
    return { tone: "neutral", text: "Coin and Shards change hands with a truce, an alliance or a resource supply. Add one to the deal.", canSend: false, sendLabel };
  }
  return undefined;
};

export const treatyLabel = (selection: TradeSelection): string =>
  selection.kind === "alliance" ? "Alliance" : `${selection.extendsTruce ? "Extend truce" : "Truce"} · ${selection.durationHours}h`;

const sideItemsHtml = (terms: DiplomacyTerms, side: TradeSide): string =>
  TRADE_GOODS.filter((spec) => spec.side === side)
    .flatMap((spec) => {
      const amount = tradeAmount(terms, spec);
      if (amount <= 0) return [];
      const unit = spec.supply ? ` <small>supply slot${amount === 1 ? "" : "s"}</small>` : "";
      return [
        `<li class="diplomacy-deal-item" data-deal-item="${spec.key}">
          <button type="button" class="diplomacy-deal-edit" data-deal-edit="${spec.key}" title="Change amount">
            <span class="diplomacy-deal-icon" aria-hidden="true">${resourceIconHtml(spec.icon)}</span>
            <span><b>${amount}</b> ${escapeHtml(spec.label)}${unit}</span>
          </button>
          <button type="button" class="diplomacy-deal-remove" data-deal-remove="${spec.key}" aria-label="Remove ${escapeHtml(spec.label)} from the deal">✕</button>
        </li>`
      ];
    })
    .join("");

/** The "In this deal" list: the treaty, then each side's goods. */
/** `locked`: a counter-offer keeps its treaty (it may switch truce/alliance, not drop it). */
export const dealSummaryHtml = (input: { selection: TradeSelection; treaty: DealTreaty; targetName: string; locked?: boolean }): string => {
  const { selection, treaty, targetName } = input;
  const { terms } = selection;
  const treatyHtml = treaty
    ? `<div class="diplomacy-deal-treaty" data-deal-treaty="${treaty}"><span>${escapeHtml(treatyLabel(selection))}</span>
        ${input.locked ? "" : `<button type="button" class="diplomacy-deal-remove" data-deal-remove="treaty" aria-label="Remove the ${treaty} from the deal">✕</button>`}</div>`
    : "";
  if (!treaty && diplomacyTermsAreEmpty(terms)) {
    return `<p class="diplomacy-deal-empty">Nothing in the deal yet.</p>`;
  }
  const give = sideItemsHtml(terms, "give");
  const ask = sideItemsHtml(terms, "ask");
  const sideBlock = (heading: string, items: string, side: TradeSide): string =>
    `<div class="diplomacy-deal-side" data-deal-side="${side}"><h4>${escapeHtml(heading)}</h4>${items ? `<ul>${items}</ul>` : `<p class="diplomacy-deal-none">Nothing</p>`}</div>`;
  const supplyNote = hasSupply(terms)
    ? `<p class="diplomacy-deal-note">Supply runs until either House cancels. Coin and Shards are paid once when accepted.</p>`
    : "";
  const isGift = selection.kind === "gift";
  return `${treatyHtml}${sideBlock(isGift ? "Your gift" : "You give", give, "give")}${isGift ? "" : sideBlock(`${targetName} gives`, ask, "ask")}${supplyNote}`;
};
