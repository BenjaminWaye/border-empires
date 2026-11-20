// "Return a town" on the diplomacy trade screen: towns you took from this
// empire in the last day and still hold, listed under your goods. Pressing a
// town puts its return into the deal (pressing again, or its ✕ in the deal
// column, takes it out). Towns go back only in a truce or as a gift to an AI
// (shared diplomacy-town-return.ts); the gateway's stance reply carries the
// list (DiplomacyStanceReply.returnableTowns), the simulation re-checks it.
import { MAX_TOWNS_PER_DEAL, townLabel, townRefKey, type DiplomacyTerms, type DiplomacyTownRef, type ReturnableTown } from "@border-empires/shared";

import type { DiplomacyStanceReply, TradeKind } from "./client-diplomacy-trade-view.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const TIER_LABEL: Record<ReturnableTown["tier"], string> = {
  SETTLEMENT: "Settlement", TOWN: "Town", CITY: "City", GREAT_CITY: "Great city", METROPOLIS: "Metropolis"
};

/** Your towns this target could take back, from the stance reply. */
export const replyReturnableTowns = (reply: DiplomacyStanceReply | undefined): ReturnableTown[] =>
  reply?.found ? reply.returnableTowns ?? [] : [];

/** Only a truce or a gift can hand a town back. */
export const townsAllowedFor = (kind: TradeKind): boolean => kind === "truce" || kind === "gift";

/** The town's name for deal text, when the reply lists it. */
export const townNameLookup = (towns: readonly ReturnableTown[]) => (town: DiplomacyTownRef): string | undefined =>
  towns.find((entry) => townRefKey(entry) === townRefKey(town))?.name;

const sideTowns = (terms: DiplomacyTerms, side: "give" | "ask"): DiplomacyTownRef[] => terms[side].towns ?? [];

/** `terms` with this town's return added to (or taken out of) what you give. */
export const withTownToggled = (terms: DiplomacyTerms, town: DiplomacyTownRef): DiplomacyTerms => {
  const key = townRefKey(town);
  const current = sideTowns(terms, "give");
  const chosen = current.some((entry) => townRefKey(entry) === key);
  const next = chosen ? current.filter((entry) => townRefKey(entry) !== key) : [...current, { x: town.x, y: town.y }].slice(0, MAX_TOWNS_PER_DEAL);
  const { towns: _previous, ...rest } = terms.give;
  return { ...terms, give: next.length > 0 ? { ...rest, towns: next } : rest };
};

/** `terms` with every town taken out of both sides (a deal that can't carry them). */
export const withoutTowns = (terms: DiplomacyTerms): DiplomacyTerms => {
  if (!terms.give.towns && !terms.ask.towns) return terms;
  const { towns: _give, ...give } = terms.give;
  const { towns: _ask, ...ask } = terms.ask;
  return { ...terms, give, ask };
};

export const townReturnHtml = (): string =>
  `<div class="diplomacy-trade-towns" data-trade-towns hidden><h4 class="diplomacy-trade-subhead">Return a town</h4><div class="diplomacy-trade-goods" data-trade-town-list></div></div>`;

const townRowHtml = (town: ReturnableTown, chosen: boolean, disabled: boolean): string =>
  `<button type="button" class="diplomacy-trade-good" data-trade-town="${townRefKey(town)}" aria-pressed="${chosen}" data-chosen="${chosen}"${disabled ? " disabled" : ""}>
    <span class="diplomacy-trade-good-name"><span class="diplomacy-trade-good-label">${escapeHtml(town.name ?? "Town")}</span>
      <span class="diplomacy-trade-good-have">${TIER_LABEL[town.tier]} · ${town.x}, ${town.y}</span></span>
    <span class="diplomacy-trade-good-amount">${chosen ? "✓" : ""}</span>
  </button>`;

/** Lists the towns; hidden with none to return. Off (but still removable) outside a truce or gift. */
export const renderTownReturn = (overlay: HTMLElement, view: { towns: readonly ReturnableTown[]; terms: DiplomacyTerms; kind: TradeKind }): void => {
  const section = overlay.querySelector<HTMLElement>("[data-trade-towns]");
  const list = overlay.querySelector<HTMLElement>("[data-trade-town-list]");
  if (!section || !list) return;
  section.hidden = view.towns.length === 0;
  const chosen = new Set(sideTowns(view.terms, "give").map(townRefKey));
  const full = chosen.size >= MAX_TOWNS_PER_DEAL;
  const allowed = townsAllowedFor(view.kind);
  section.title = allowed ? "" : "Towns are returned only in a truce, or as a gift to an AI empire.";
  list.innerHTML = view.towns.map((town) => {
    const isChosen = chosen.has(townRefKey(town));
    return townRowHtml(town, isChosen, !isChosen && (!allowed || full));
  }).join("");
};

/** The deal column's line for each returned town, with a ✕ to take it out. */
export const dealTownItemsHtml = (terms: DiplomacyTerms, side: "give" | "ask", nameOf?: (town: DiplomacyTownRef) => string | undefined): string =>
  sideTowns(terms, side).map((town) => `<li class="diplomacy-deal-item" data-deal-town="${townRefKey(town)}">
      <span><b>Return</b> ${escapeHtml(townLabel(town, nameOf?.(town)))}</span>
      ${side === "give" ? `<button type="button" class="diplomacy-deal-remove" data-deal-remove-town="${townRefKey(town)}" aria-label="Take the town at ${town.x}, ${town.y} out of the deal">✕</button>` : ""}
    </li>`).join("");

const parseKey = (key: string | undefined): DiplomacyTownRef | undefined => {
  const [x, y] = (key ?? "").split(",").map(Number);
  return Number.isInteger(x) && Number.isInteger(y) ? { x: x!, y: y! } : undefined;
};

/** Pressing a town in the list, or its ✕ in the deal, toggles it. */
export const bindTownReturn = (overlay: HTMLElement, onToggle: (town: DiplomacyTownRef) => void): void => {
  overlay.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-trade-town], [data-deal-remove-town]") : null;
    const town = parseKey(target?.dataset.tradeTown ?? target?.dataset.dealRemoveTown);
    if (town) onToggle(town);
  });
};
