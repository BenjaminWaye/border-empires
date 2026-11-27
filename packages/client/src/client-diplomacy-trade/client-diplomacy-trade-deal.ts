// The middle column of the diplomacy trade screen: only what is in the deal
// right now -- the treaty (if any), what you give and what they give -- each
// with a ✕ to take it out again. Also decides what kind of offer the deal is:
// a truce or alliance when one is picked, otherwise a resource trade, or a
// gift when you only give an AI coin.
import { RESOURCE_SUPPLY_TRADE_DAYS, hasRecurringCoin, recurringCoinTermHours, diplomacyTermsAreEmpty, hasResourceSupplyOffer, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";

import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import { dealTownItemsHtml } from "./client-diplomacy-town-return.js";
import type { DiplomacyTownRef } from "@border-empires/shared";
import { TRADE_GOODS, tradeAmount, tradeDisplayScale, type TradeSide } from "./client-diplomacy-trade-goods.js";
import type { TradeKind, TradeSelection, TradeVerdict } from "./client-diplomacy-trade-view.js";
import { allianceTreatyLabel, type FealtyStanding } from "../client-fealty/client-fealty.js";

/** A truce or alliance picked from the left column, or none. */
export type DealTreaty = DiplomacyOfferKind | undefined;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const asksAnything = (terms: DiplomacyTerms): boolean => terms.ask.gold > 0 || hasResourceSupplyOffer(terms.ask.resources) || Boolean(terms.ask.towns?.length);

const hasSupply = (terms: DiplomacyTerms): boolean => hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources);

/**
 * The offer this deal sends. With no treaty: resource supply (or anything
 * asked for) makes it a resource trade; giving an AI only coin is a
 * gift. Humans take no gifts, so that is a (not yet sendable) trade for them.
 */
export const dealKind = (treaty: DealTreaty, terms: DiplomacyTerms, targetIsAi: boolean): TradeKind =>
  treaty ?? (hasSupply(terms) || hasRecurringCoin(terms) || asksAnything(terms) || !targetIsAi ? "trade" : "gift");

/** Treaty-less trade/gift verdicts that the shared verdict words for a different screen. */
export const dealVerdictOverride = (treaty: DealTreaty, kind: TradeKind, terms: DiplomacyTerms, sendLabel: string, allied = false): TradeVerdict | undefined => {
  if (treaty) return undefined;
  if (diplomacyTermsAreEmpty(terms)) {
    const text = allied ? "Add goods from either side to trade with your ally." : "Pick a truce or alliance, or add goods from either side.";
    return { tone: "neutral", text, canSend: false, sendLabel: "Send offer" };
  }
  if (!hasSupply(terms) && kind !== "gift") {
    const text = allied ? "Coin changes hands with a resource supply. Add one to the deal." : "Coin changes hands with a truce, an alliance or a resource supply. Add one to the deal.";
    return { tone: "neutral", text, canSend: false, sendLabel };
  }
  return undefined;
};

export const treatyLabel = (selection: TradeSelection, fealty: FealtyStanding = "ALLIANCE"): string =>
  selection.kind === "alliance" ? allianceTreatyLabel(fealty) : `${selection.extendsTruce ? "Extend truce" : "Truce"} · ${selection.durationHours}h`;

const sideItemsHtml = (terms: DiplomacyTerms, side: TradeSide, coinHours: number): string =>
  TRADE_GOODS.filter((spec) => spec.side === side)
    .flatMap((spec) => {
      const amount = tradeAmount(terms, spec);
      if (amount <= 0) return [];
      const unit = spec.good === "coinPerHour" ? ` <small>up to ${amount * coinHours} Coin over ${coinHours}h</small>` : spec.supply ? ` <small>supply slot${amount === 1 ? "" : "s"}</small>` : "";
      const shown = amount * tradeDisplayScale(spec);
      return [
        `<li class="diplomacy-deal-item" data-deal-item="${spec.key}">
          <button type="button" class="diplomacy-deal-edit" data-deal-edit="${spec.key}" title="Change amount">
            <span class="diplomacy-deal-icon" aria-hidden="true">${resourceIconHtml(spec.icon)}</span>
            <span><b>${shown}</b> ${escapeHtml(spec.label)}${unit}</span>
          </button>
          <button type="button" class="diplomacy-deal-remove" data-deal-remove="${spec.key}" aria-label="Remove ${escapeHtml(spec.label)} from the deal">✕</button>
        </li>`
      ];
    })
    .join("");

/** The "In this deal" list: the treaty, then each side's goods. */
/** `locked`: a counter-offer keeps its treaty (it may switch truce/alliance, not drop it). */
export const dealSummaryHtml = (input: { selection: TradeSelection; treaty: DealTreaty; targetName: string; locked?: boolean; townName?: (town: DiplomacyTownRef) => string | undefined; fealty?: FealtyStanding }): string => {
  const { selection, treaty, targetName } = input;
  const { terms } = selection;
  const treatyHtml = treaty
    ? `<div class="diplomacy-deal-treaty" data-deal-treaty="${treaty}"><span>${escapeHtml(treatyLabel(selection, input.fealty))}</span>
        ${input.locked ? "" : `<button type="button" class="diplomacy-deal-remove" data-deal-remove="treaty" aria-label="Remove the ${treaty} from the deal">✕</button>`}</div>`
    : "";
  if (!treaty && diplomacyTermsAreEmpty(terms)) {
    return `<p class="diplomacy-deal-empty">Nothing in the deal yet.</p>`;
  }
  // A coin pledge (stored per hour, shown per day) runs for the supply term, or a slot-free truce's own length.
  const coinHours = recurringCoinTermHours(selection.kind === "gift" ? "trade" : selection.kind, selection.durationHours, terms) ?? RESOURCE_SUPPLY_TRADE_DAYS * 24;
  const give = sideItemsHtml(terms, "give", coinHours) + dealTownItemsHtml(terms, "give", input.townName);
  const ask = sideItemsHtml(terms, "ask", coinHours) + dealTownItemsHtml(terms, "ask", input.townName);
  const sideBlock = (heading: string, items: string, side: TradeSide): string =>
    `<div class="diplomacy-deal-side" data-deal-side="${side}"><h4>${escapeHtml(heading)}</h4>${items ? `<ul>${items}</ul>` : `<p class="diplomacy-deal-none">Nothing</p>`}</div>`;
  const supplyNote = hasSupply(terms)
    ? `<p class="diplomacy-deal-note">Supply lasts ${RESOURCE_SUPPLY_TRADE_DAYS} days from acceptance and is binding: only war between you ends it early. Upfront Coin is paid when accepted.</p>`
    : "";
  const incomeNote = hasRecurringCoin(terms)
    ? `<p class="diplomacy-deal-note">Recurring payments come from earned Coin${hasSupply(terms) ? " and pause if resource delivery pauses" : `, run ${coinHours}h from acceptance and end only with the term or war`}. Payments are reduced if income falls short.</p>` : "";
  const isGift = selection.kind === "gift";
  return `${treatyHtml}${sideBlock(isGift ? "Your gift" : "You give", give, "give")}${isGift ? "" : sideBlock(`${targetName} gives`, ask, "ask")}${supplyNote}${incomeNote}`;
};
