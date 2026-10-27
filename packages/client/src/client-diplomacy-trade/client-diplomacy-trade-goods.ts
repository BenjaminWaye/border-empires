// The "You give" / "You ask" goods on the diplomacy trade screen, laid out like
// a 4X deal table: each side lists its tradeable goods as item tiles (Coin,
// Shards), and pressing one opens a slider from 0 to what that side holds.
// Only one slider is open at a time; the tiles always show the chosen amount.
import type { DiplomacyGoods, DiplomacyTerms } from "@border-empires/shared";

import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

export type TradeSide = "give" | "ask";
export type TradeGood = keyof DiplomacyGoods;
export type TradeGoodKey = `${TradeSide}-${TradeGood}`;

type TradeGoodSpec = { key: TradeGoodKey; side: TradeSide; good: TradeGood; label: string; icon: "GOLD" | "SHARD"; aria: string };

const GOODS: readonly TradeGoodSpec[] = [
  { key: "give-gold", side: "give", good: "gold", label: "Coin", icon: "GOLD", aria: "Coin you give" },
  { key: "give-shard", side: "give", good: "shard", label: "Shards", icon: "SHARD", aria: "Shards you give" },
  { key: "ask-gold", side: "ask", good: "gold", label: "Coin", icon: "GOLD", aria: "Coin you ask for" },
  { key: "ask-shard", side: "ask", good: "shard", label: "Shards", icon: "SHARD", aria: "Shards you ask for" }
];

/**
 * What the other side's holdings can't tell us (a human, or an AI not read
 * yet) still needs a slider end: ask for up to this much, or as much as you
 * hold yourself if that is more.
 */
export const UNKNOWN_HOLDINGS_ASK_MAX: DiplomacyGoods = { gold: 100, shard: 10 };

export type TradeGoodsLimits = Record<TradeGoodKey, number>;

/**
 * Each slider's top end: your own holdings for what you give, the AI's
 * holdings for what you ask (it can't pay more). Never below the amount
 * already chosen, so a counter-offer's terms are never silently cut.
 */
export const tradeGoodsLimits = (own: DiplomacyGoods, reply: DiplomacyStanceReply | undefined, terms: DiplomacyTerms): TradeGoodsLimits => {
  const theirs =
    reply?.found && reply.ai && reply.pricing
      ? reply.pricing.aiHoldings
      : { gold: Math.max(UNKNOWN_HOLDINGS_ASK_MAX.gold, own.gold), shard: Math.max(UNKNOWN_HOLDINGS_ASK_MAX.shard, own.shard) };
  const limit = (holdings: number, chosen: number): number => Math.max(0, Math.floor(holdings), chosen);
  return {
    "give-gold": limit(own.gold, terms.give.gold),
    "give-shard": limit(own.shard, terms.give.shard),
    "ask-gold": limit(theirs.gold, terms.ask.gold),
    "ask-shard": limit(theirs.shard, terms.ask.shard)
  };
};

const sideHtml = (side: TradeSide, heading: string): string => {
  const goods = GOODS.filter((spec) => spec.side === side);
  const tiles = goods
    .map(
      (spec) => `<button type="button" class="diplomacy-trade-good" data-trade-good="${spec.key}" aria-expanded="false" aria-controls="diplomacy-trade-slider-${spec.key}">
        <span class="diplomacy-trade-good-icon" aria-hidden="true">${resourceIconHtml(spec.icon, "large")}</span>
        <span class="diplomacy-trade-good-label">${spec.label}</span>
        <span class="diplomacy-trade-good-amount" data-trade-amount="${spec.key}">0</span>
      </button>`
    )
    .join("");
  const sliders = goods
    .map(
      (spec) => `<div class="diplomacy-trade-slider" id="diplomacy-trade-slider-${spec.key}" data-trade-slider="${spec.key}" hidden>
        <input type="range" min="0" step="1" data-trade-${spec.key} aria-label="${spec.aria}">
        <span class="diplomacy-trade-slider-ends"><span>0</span><span data-trade-max="${spec.key}">0</span></span>
      </div>`
    )
    .join("");
  return `<section class="diplomacy-trade-side" data-trade-side="${side}">
    <h3>${heading}</h3>
    <div class="diplomacy-trade-goods">${tiles}</div>
    ${sliders}
  </section>`;
};

export const tradeGoodsHtml = (): string =>
  `<div class="diplomacy-trade-sides">${sideHtml("give", "You give")}${sideHtml("ask", "You ask")}</div>`;

const amountOf = (terms: DiplomacyTerms, spec: TradeGoodSpec): number => terms[spec.side][spec.good];

/** Syncs tiles and sliders to the chosen terms; `expanded` is the one open slider, if any. */
export const renderTradeGoods = (overlay: HTMLElement, terms: DiplomacyTerms, limits: TradeGoodsLimits, expanded: TradeGoodKey | undefined): void => {
  for (const spec of GOODS) {
    const amount = amountOf(terms, spec);
    const max = limits[spec.key];
    const tile = overlay.querySelector<HTMLButtonElement>(`[data-trade-good="${spec.key}"]`);
    if (tile) {
      tile.setAttribute("aria-expanded", String(expanded === spec.key));
      tile.dataset.chosen = String(amount > 0);
      tile.disabled = max === 0;
      tile.title = max === 0 ? (spec.side === "give" ? `You have no ${spec.label.toLocaleLowerCase()} to give.` : `They have no ${spec.label.toLocaleLowerCase()} to give.`) : "";
    }
    const amountEl = overlay.querySelector<HTMLElement>(`[data-trade-amount="${spec.key}"]`);
    if (amountEl) amountEl.textContent = String(amount);
    const slider = overlay.querySelector<HTMLElement>(`[data-trade-slider="${spec.key}"]`);
    if (slider) slider.hidden = expanded !== spec.key || max === 0;
    const maxEl = overlay.querySelector<HTMLElement>(`[data-trade-max="${spec.key}"]`);
    if (maxEl) maxEl.textContent = String(max);
    const input = overlay.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`);
    if (input) {
      // The top end first: a range input clamps a value above its max.
      input.max = String(max);
      if (input.value !== String(amount)) input.value = String(amount);
      input.style.setProperty("--fill", `${max > 0 ? (amount / max) * 100 : 0}%`);
    }
  }
};

const readAmount = (input: HTMLInputElement | null): number => {
  const value = Math.floor(Number(input?.value ?? 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const readTradeGoods = (overlay: HTMLElement): DiplomacyTerms => ({
  give: { gold: readAmount(overlay.querySelector("[data-trade-give-gold]")), shard: readAmount(overlay.querySelector("[data-trade-give-shard]")) },
  ask: { gold: readAmount(overlay.querySelector("[data-trade-ask-gold]")), shard: readAmount(overlay.querySelector("[data-trade-ask-shard]")) }
});

/** Pressing a tile toggles its slider; moving a slider reports the new terms. */
export const bindTradeGoods = (overlay: HTMLElement, handlers: { onToggle: (key: TradeGoodKey) => void; onChange: (terms: DiplomacyTerms) => void }): void => {
  for (const spec of GOODS) {
    overlay.querySelector<HTMLButtonElement>(`[data-trade-good="${spec.key}"]`)?.addEventListener("click", () => {
      handlers.onToggle(spec.key);
      overlay.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`)?.focus();
    });
    overlay.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`)?.addEventListener("input", () => handlers.onChange(readTradeGoods(overlay)));
  }
};
