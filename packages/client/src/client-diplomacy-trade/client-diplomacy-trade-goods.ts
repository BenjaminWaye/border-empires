// The "You give" / "You ask" goods on the diplomacy trade screen, laid out like
// a 4X deal table: each side lists its tradeable goods as item tiles (Coin,
// Shards), and pressing one opens a slider from 0 to what that side holds,
// with an exact-amount box beside it for amounts the slider can't reach.
// Only one slider is open at a time; the tiles always show the chosen amount.
import type { DiplomacyGoods, DiplomacyTerms } from "@border-empires/shared";

import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

export type TradeSide = "give" | "ask";
export type TradeGood = "gold" | "shard";
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
 * holdings for what you ask (it can't pay more). Never below `reach`: the
 * screen's opening terms and any amount typed into an exact box, so a
 * counter-offer's terms are never silently cut. Dragging a slider never moves
 * its own top end -- it would shrink the scale under the pointer.
 */
export const tradeGoodsLimits = (own: DiplomacyGoods, reply: DiplomacyStanceReply | undefined, reach: DiplomacyTerms): TradeGoodsLimits => {
  const theirs =
    reply?.found && reply.ai && reply.pricing
      ? reply.pricing.aiHoldings
      : { gold: Math.max(UNKNOWN_HOLDINGS_ASK_MAX.gold, own.gold), shard: Math.max(UNKNOWN_HOLDINGS_ASK_MAX.shard, own.shard) };
  const limit = (holdings: number, reached: number): number => Math.max(0, Math.floor(holdings), reached);
  return {
    "give-gold": limit(own.gold, reach.give.gold),
    "give-shard": limit(own.shard, reach.give.shard),
    "ask-gold": limit(theirs.gold, reach.ask.gold),
    "ask-shard": limit(theirs.shard, reach.ask.shard)
  };
};

const specFor = (key: TradeGoodKey): TradeGoodSpec => GOODS.find((spec) => spec.key === key) ?? GOODS[0]!;

/** `terms` with one good's amount replaced. */
export const withTradeAmount = (terms: DiplomacyTerms, key: TradeGoodKey, amount: number): DiplomacyTerms => {
  const { side, good } = specFor(key);
  return { ...terms, [side]: { ...terms[side], [good]: amount } };
};

/** The larger of each amount, for growing a screen's slider reach. */
export const maxTradeTerms = (a: DiplomacyTerms, b: DiplomacyTerms): DiplomacyTerms => ({
  give: { gold: Math.max(a.give.gold, b.give.gold), shard: Math.max(a.give.shard, b.give.shard) },
  ask: { gold: Math.max(a.ask.gold, b.ask.gold), shard: Math.max(a.ask.shard, b.ask.shard) }
});

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
        <div class="diplomacy-trade-slider-row">
          <input type="range" min="0" step="1" data-trade-${spec.key} aria-label="${spec.aria}">
          <input type="number" inputmode="numeric" min="0" step="1" data-trade-exact="${spec.key}" aria-label="${spec.aria}, exact amount">
        </div>
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

/**
 * Syncs tiles and sliders to the chosen terms; `expanded` is the one open
 * slider, if any. Returns the slider still open: a tile with nothing to trade
 * closes its own.
 */
export const renderTradeGoods = (overlay: HTMLElement, terms: DiplomacyTerms, limits: TradeGoodsLimits, expanded: TradeGoodKey | undefined): TradeGoodKey | undefined => {
  const open = expanded && limits[expanded] > 0 ? expanded : undefined;
  for (const spec of GOODS) {
    const amount = amountOf(terms, spec);
    const max = limits[spec.key];
    const tile = overlay.querySelector<HTMLButtonElement>(`[data-trade-good="${spec.key}"]`);
    if (tile) {
      tile.setAttribute("aria-expanded", String(open === spec.key));
      tile.setAttribute("aria-label", `${spec.aria}: ${amount}`);
      tile.dataset.chosen = String(amount > 0);
      tile.disabled = max === 0;
      tile.title = max === 0 ? (spec.side === "give" ? `You have no ${spec.label.toLocaleLowerCase()} to give.` : `They have no ${spec.label.toLocaleLowerCase()} to give.`) : "";
    }
    const amountEl = overlay.querySelector<HTMLElement>(`[data-trade-amount="${spec.key}"]`);
    if (amountEl) amountEl.textContent = String(amount);
    const slider = overlay.querySelector<HTMLElement>(`[data-trade-slider="${spec.key}"]`);
    if (slider) slider.hidden = open !== spec.key;
    const maxEl = overlay.querySelector<HTMLElement>(`[data-trade-max="${spec.key}"]`);
    if (maxEl) maxEl.textContent = String(max);
    const input = overlay.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`);
    if (input) {
      // The top end first: a range input clamps a value above its max.
      input.max = String(max);
      if (input.value !== String(amount)) input.value = String(amount);
      input.style.setProperty("--fill", `${max > 0 ? (amount / max) * 100 : 0}%`);
    }
    // Left alone while being typed in, so "0" never replaces a cleared box mid-edit.
    const exact = overlay.querySelector<HTMLInputElement>(`[data-trade-exact="${spec.key}"]`);
    if (exact && exact !== document.activeElement) exact.value = String(amount);
  }
  return open;
};

const readAmount = (input: HTMLInputElement | null): number => {
  const value = Math.floor(Number(input?.value ?? 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Pressing a tile toggles its slider (and focuses it when it opens); moving a
 * slider or typing an exact amount reports the new amount. `typed` is true
 * for the exact box, whose amount may go past the slider's top end.
 */
export const bindTradeGoods = (
  overlay: HTMLElement,
  handlers: { onToggle: (key: TradeGoodKey) => void; onAmount: (key: TradeGoodKey, amount: number, typed: boolean) => void }
): void => {
  for (const spec of GOODS) {
    const slider = overlay.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`);
    const exact = overlay.querySelector<HTMLInputElement>(`[data-trade-exact="${spec.key}"]`);
    overlay.querySelector<HTMLButtonElement>(`[data-trade-good="${spec.key}"]`)?.addEventListener("click", () => {
      handlers.onToggle(spec.key);
      if (slider && !slider.closest<HTMLElement>("[data-trade-slider]")?.hidden) slider.focus();
    });
    slider?.addEventListener("input", () => handlers.onAmount(spec.key, readAmount(slider), false));
    exact?.addEventListener("input", () => handlers.onAmount(spec.key, readAmount(exact), true));
    // Show the amount actually kept (e.g. "" or "-3" read as 0) once typing stops.
    exact?.addEventListener("change", () => handlers.onAmount(spec.key, readAmount(exact), false));
  }
};
