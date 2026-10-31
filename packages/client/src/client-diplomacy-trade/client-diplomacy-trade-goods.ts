// The two side columns of the diplomacy trade screen: "Yours" on the left and
// "Theirs" on the right, each listing what that side can put into the deal
// (Coin, Shards and spare resource supply slots) as rows. Pressing a row opens
// a slider under it from 0 to what that side holds, with an exact-amount box
// beside it for amounts the slider can't reach. Only one slider is open at a
// time; each row always shows the amount in the deal.
import { MAX_RESOURCE_TRADE_SLOTS, TRADABLE_SUPPLY_RESOURCES, supplyResourceLabel, type DiplomacyGoods, type DiplomacyTerms, type ResourceSupplyOffer, type TradableSupplyResource } from "@border-empires/shared";

import { resourceIconHtml } from "../client-resource-icons/client-resource-icons.js";
import type { DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

export type TradeSide = "give" | "ask";
export type TradeGood = "gold" | "shard" | TradableSupplyResource;
export type TradeGoodKey = `${TradeSide}-${TradeGood}`;

export type TradeGoodSpec = { key: TradeGoodKey; side: TradeSide; good: TradeGood; label: string; icon: string; aria: string; supply: boolean };

/** The shared label spells Food in capitals for the resource bar; rows read better in plain case. */
const supplyLabel = (resource: TradableSupplyResource): string => (resource === "FOOD" ? "Food" : supplyResourceLabel(resource));

const sideSpecs = (side: TradeSide): TradeGoodSpec[] => {
  const whose = side === "give" ? "you give" : "you ask for";
  return [
    { key: `${side}-gold`, side, good: "gold", label: "Coin", icon: "GOLD", aria: `Coin ${whose}`, supply: false },
    { key: `${side}-shard`, side, good: "shard", label: "Shards", icon: "SHARD", aria: `Shards ${whose}`, supply: false },
    ...TRADABLE_SUPPLY_RESOURCES.map((resource): TradeGoodSpec => ({
      key: `${side}-${resource}`,
      side,
      good: resource,
      label: supplyLabel(resource),
      icon: resource,
      aria: `${supplyLabel(resource)} supply slots ${whose}`,
      supply: true
    }))
  ];
};

export const TRADE_GOODS: readonly TradeGoodSpec[] = [...sideSpecs("give"), ...sideSpecs("ask")];

/**
 * What the other side's holdings can't tell us (a human, or an AI not read
 * yet) still needs a slider end: ask for up to this much, or as much as you
 * hold yourself if that is more.
 */
export const UNKNOWN_HOLDINGS_ASK_MAX: DiplomacyGoods = { gold: 100, shard: 10 };
/** The same for a resource supply slot whose spare count on their side is unknown. */
export const UNKNOWN_SUPPLY_ASK_MAX = 10;

export type TradeGoodsLimits = Record<TradeGoodKey, number>;

/** The amount of one good in `terms`. */
export const tradeAmount = (terms: DiplomacyTerms, spec: TradeGoodSpec): number => {
  const side = terms[spec.side];
  return spec.good === "gold" ? side.gold : spec.good === "shard" ? side.shard : (side.resources?.[spec.good] ?? 0);
};

const specFor = (key: TradeGoodKey): TradeGoodSpec => TRADE_GOODS.find((spec) => spec.key === key) ?? TRADE_GOODS[0]!;

/** What that side holds of a good, if known. */
const heldAmount = (holdings: DiplomacyGoods, spec: TradeGoodSpec): number =>
  spec.good === "gold" ? holdings.gold : spec.good === "shard" ? holdings.shard : (holdings.resources?.[spec.good] ?? 0);

/** The AI's holdings when its reply carries them; undefined for a human or an unread AI. */
export const theirHoldings = (reply: DiplomacyStanceReply | undefined): DiplomacyGoods | undefined =>
  reply?.found && reply.ai && reply.pricing ? reply.pricing.aiHoldings : undefined;

/**
 * Each slider's top end: your own holdings for what you give, the AI's
 * holdings for what you ask (it can't pay more). Never below `reach`: the
 * screen's opening terms and any amount typed into an exact box, so a
 * counter-offer's terms are never silently cut. Dragging a slider never moves
 * its own top end -- it would shrink the scale under the pointer.
 */
export const tradeGoodsLimits = (own: DiplomacyGoods, reply: DiplomacyStanceReply | undefined, reach: DiplomacyTerms): TradeGoodsLimits => {
  const theirs = theirHoldings(reply);
  const limits = {} as TradeGoodsLimits;
  for (const spec of TRADE_GOODS) {
    const held =
      spec.side === "give"
        ? heldAmount(own, spec)
        : theirs && (!spec.supply || theirs.resources)
          ? heldAmount(theirs, spec)
          : spec.supply
            ? Math.max(UNKNOWN_SUPPLY_ASK_MAX, heldAmount(own, spec))
            : Math.max(spec.good === "gold" ? UNKNOWN_HOLDINGS_ASK_MAX.gold : UNKNOWN_HOLDINGS_ASK_MAX.shard, heldAmount(own, spec));
    limits[spec.key] = Math.max(0, Math.floor(held), tradeAmount(reach, spec));
  }
  return limits;
};

/** A data attribute's value as a goods key, or undefined when it names no good. */
export const asTradeGoodKey = (value: string | undefined): TradeGoodKey | undefined => TRADE_GOODS.find((spec) => spec.key === value)?.key;

/**
 * `terms` with one good's amount replaced; a supply slot set to 0 leaves the
 * deal, and supply is capped at what the server accepts per resource.
 */
export const withTradeAmount = (terms: DiplomacyTerms, key: TradeGoodKey, amount: number): DiplomacyTerms => {
  const { side, good } = specFor(key);
  if (good === "gold" || good === "shard") return { ...terms, [side]: { ...terms[side], [good]: amount } };
  amount = Math.min(MAX_RESOURCE_TRADE_SLOTS, amount);
  const resources: ResourceSupplyOffer = { ...terms[side].resources };
  if (amount > 0) resources[good] = amount;
  else delete resources[good];
  const { resources: _dropped, ...rest } = terms[side];
  return { ...terms, [side]: Object.keys(resources).length > 0 ? { ...rest, resources } : rest };
};

/** The larger of each amount, for growing a screen's slider reach. */
export const maxTradeTerms = (a: DiplomacyTerms, b: DiplomacyTerms): DiplomacyTerms =>
  TRADE_GOODS.reduce((terms, spec) => withTradeAmount(terms, spec.key, Math.max(tradeAmount(a, spec), tradeAmount(b, spec))), {
    give: { gold: 0, shard: 0 },
    ask: { gold: 0, shard: 0 }
  } as DiplomacyTerms);

export const tradeTermsEqual = (a: DiplomacyTerms, b: DiplomacyTerms): boolean => TRADE_GOODS.every((spec) => tradeAmount(a, spec) === tradeAmount(b, spec));

const goodRowHtml = (spec: TradeGoodSpec): string => `<div class="diplomacy-trade-good-row" data-trade-row="${spec.key}">
    <button type="button" class="diplomacy-trade-good" data-trade-good="${spec.key}" aria-expanded="false" aria-controls="diplomacy-trade-slider-${spec.key}">
      <span class="diplomacy-trade-good-icon" aria-hidden="true">${resourceIconHtml(spec.icon, "large")}</span>
      <span class="diplomacy-trade-good-name"><span class="diplomacy-trade-good-label">${spec.label}</span>
        <span class="diplomacy-trade-good-have" data-trade-have="${spec.key}"></span></span>
      <span class="diplomacy-trade-good-amount" data-trade-amount="${spec.key}">0</span>
    </button>
    <div class="diplomacy-trade-slider" id="diplomacy-trade-slider-${spec.key}" data-trade-slider="${spec.key}" hidden>
      <div class="diplomacy-trade-slider-row">
        <input type="range" min="0" step="1" data-trade-${spec.key} aria-label="${spec.aria}">
        <input type="number" inputmode="numeric" min="0" step="1" data-trade-exact="${spec.key}" aria-label="${spec.aria}, exact amount">
      </div>
      <span class="diplomacy-trade-slider-ends"><span>0</span><span data-trade-max="${spec.key}">0</span></span>
    </div>
  </div>`;

/** One side's goods: coin and Shards, then the resource supply slots (shown once the server sends spare counts). */
export const tradeGoodsHtml = (side: TradeSide, withSupply: boolean): string => {
  const specs = TRADE_GOODS.filter((spec) => spec.side === side);
  const supply = withSupply
    ? `<h4 class="diplomacy-trade-subhead" data-trade-supply-head="${side}">Resource supply slots</h4>${specs.filter((s) => s.supply).map(goodRowHtml).join("")}`
    : "";
  return `<div class="diplomacy-trade-goods" data-trade-goods="${side}">${specs.filter((s) => !s.supply).map(goodRowHtml).join("")}${supply}</div>`;
};

const readAmount = (input: HTMLInputElement | null): number => {
  const value = Math.floor(Number(input?.value ?? 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export type TradeGoodsView = {
  terms: DiplomacyTerms;
  limits: TradeGoodsLimits;
  expanded: TradeGoodKey | undefined;
  /** "have 40" / "40 spare" on your side; theirs only when known. */
  haveText: (spec: TradeGoodSpec) => string;
  /** A supply row whose side has none spare (and none in the deal) is hidden rather than greyed out. */
  hideEmptySupply: Record<TradeSide, boolean>;
};

/**
 * Syncs rows and sliders to the chosen terms; `expanded` is the one open
 * slider, if any. Returns the slider still open: a row with nothing to trade
 * closes its own.
 */
export const renderTradeGoods = (overlay: HTMLElement, view: TradeGoodsView): TradeGoodKey | undefined => {
  const { terms, limits, expanded } = view;
  const open = expanded && limits[expanded] > 0 ? expanded : undefined;
  for (const spec of TRADE_GOODS) {
    const amount = tradeAmount(terms, spec);
    const max = limits[spec.key];
    const row = overlay.querySelector<HTMLElement>(`[data-trade-row="${spec.key}"]`);
    if (!row) continue;
    row.hidden = spec.supply && view.hideEmptySupply[spec.side] && max === 0 && amount === 0;
    const tile = row.querySelector<HTMLButtonElement>("[data-trade-good]");
    if (tile) {
      tile.setAttribute("aria-expanded", String(open === spec.key));
      tile.setAttribute("aria-label", `${spec.aria}: ${amount}`);
      tile.dataset.chosen = String(amount > 0);
      tile.disabled = max === 0;
      tile.title = max === 0 ? (spec.side === "give" ? `You have no ${spec.label.toLocaleLowerCase()} to give.` : `They have no ${spec.label.toLocaleLowerCase()} to give.`) : "";
    }
    const haveEl = row.querySelector<HTMLElement>("[data-trade-have]");
    if (haveEl) haveEl.textContent = view.haveText(spec);
    const amountEl = row.querySelector<HTMLElement>("[data-trade-amount]");
    if (amountEl) amountEl.textContent = String(amount);
    const slider = row.querySelector<HTMLElement>("[data-trade-slider]");
    if (slider) slider.hidden = open !== spec.key;
    const maxEl = row.querySelector<HTMLElement>("[data-trade-max]");
    if (maxEl) maxEl.textContent = String(max);
    const input = row.querySelector<HTMLInputElement>(`[data-trade-${spec.key}]`);
    if (input) {
      // The top end first: a range input clamps a value above its max.
      input.max = String(max);
      if (input.value !== String(amount)) input.value = String(amount);
      input.style.setProperty("--fill", `${max > 0 ? (amount / max) * 100 : 0}%`);
    }
    // Left alone while being typed in, so "0" never replaces a cleared box mid-edit.
    const exact = row.querySelector<HTMLInputElement>("[data-trade-exact]");
    if (exact && exact !== document.activeElement) exact.value = String(amount);
  }
  for (const side of ["give", "ask"] as const) {
    const head = overlay.querySelector<HTMLElement>(`[data-trade-supply-head="${side}"]`);
    const rows = Array.from(overlay.querySelectorAll<HTMLElement>(`[data-trade-goods="${side}"] [data-trade-row]`));
    if (head) head.hidden = !rows.some((row) => !row.hidden && TRADE_GOODS.find((s) => s.key === row.dataset.tradeRow)?.supply);
  }
  return open;
};

/**
 * Pressing a row toggles its slider (and focuses it when it opens); moving a
 * slider or typing an exact amount reports the new amount. `typed` is true
 * for the exact box, whose amount may go past the slider's top end.
 */
export const bindTradeGoods = (
  overlay: HTMLElement,
  handlers: { onToggle: (key: TradeGoodKey) => void; onAmount: (key: TradeGoodKey, amount: number, typed: boolean) => void }
): void => {
  for (const spec of TRADE_GOODS) {
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
