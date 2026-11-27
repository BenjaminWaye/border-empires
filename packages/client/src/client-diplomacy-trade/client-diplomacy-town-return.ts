// "Return a town" on the diplomacy trade screen: towns you took from this
// empire in the last day and still hold, listed under your goods, and towns
// it took from you in the last day, listed under theirs. Pressing a town puts
// its return into the deal (pressing again, or its ✕ in the deal column, takes
// it out). Towns change hands only in a truce, or as your gift to an AI
// (shared diplomacy-town-return.ts); the gateway's stance reply carries both
// lists (DiplomacyStanceReply.returnableTowns / askableTowns), the simulation
// re-checks them.
import { MAX_TOWNS_PER_DEAL, townLabel, townRefKey, type DiplomacyTerms, type DiplomacyTownRef, type ReturnableTown } from "@border-empires/shared";

import { navTabIconUrl } from "../client-nav-icons/client-nav-icons.js";
import type { DiplomacyStanceReply, TradeKind } from "./client-diplomacy-trade-view.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const TIER_LABEL: Record<ReturnableTown["tier"], string> = {
  SETTLEMENT: "Settlement", TOWN: "Town", CITY: "City", GREAT_CITY: "Great city", METROPOLIS: "Metropolis"
};

export type TownSide = "give" | "ask";

/** Your towns this target could take back, from the stance reply. */
export const replyReturnableTowns = (reply: DiplomacyStanceReply | undefined): ReturnableTown[] =>
  reply?.found ? reply.returnableTowns ?? [] : [];

/** Their towns, taken from you, that you could ask back. */
export const replyAskableTowns = (reply: DiplomacyStanceReply | undefined): ReturnableTown[] =>
  reply?.found ? reply.askableTowns ?? [] : [];

/** Only a truce or a gift can hand a town back; a gift asks for nothing, so only a truce asks for one. */
export const townsAllowedFor = (kind: TradeKind, side: TownSide = "give"): boolean => kind === "truce" || (side === "give" && kind === "gift");

/** The town's name for deal text, when the reply lists it. */
export const townNameLookup = (towns: readonly ReturnableTown[]) => (town: DiplomacyTownRef): string | undefined =>
  towns.find((entry) => townRefKey(entry) === townRefKey(town))?.name;

const sideTowns = (terms: DiplomacyTerms, side: TownSide): DiplomacyTownRef[] => terms[side].towns ?? [];

/** `terms` with this town's return added to (or taken out of) what `side` hands back. */
export const withTownToggled = (terms: DiplomacyTerms, town: DiplomacyTownRef, side: TownSide = "give"): DiplomacyTerms => {
  const key = townRefKey(town);
  const current = sideTowns(terms, side);
  const chosen = current.some((entry) => townRefKey(entry) === key);
  const next = chosen ? current.filter((entry) => townRefKey(entry) !== key) : [...current, { x: town.x, y: town.y }].slice(0, MAX_TOWNS_PER_DEAL);
  const { towns: _previous, ...rest } = terms[side];
  return { ...terms, [side]: next.length > 0 ? { ...rest, towns: next } : rest };
};

/** `terms` without asked-for towns (a deal that can't ask for them, such as a gift). */
export const withoutAskedTowns = (terms: DiplomacyTerms): DiplomacyTerms => {
  if (!terms.ask.towns) return terms;
  const { towns: _ask, ...ask } = terms.ask;
  return { ...terms, ask };
};

/** `terms` with every town taken out of both sides (a deal that can't carry them). */
export const withoutTowns = (terms: DiplomacyTerms): DiplomacyTerms => {
  if (!terms.give.towns && !terms.ask.towns) return terms;
  const { towns: _give, ...give } = terms.give;
  const { towns: _ask, ...ask } = terms.ask;
  return { ...terms, give, ask };
};

export const townReturnHtml = (side: TownSide = "give"): string =>
  `<div class="diplomacy-trade-towns" data-trade-towns="${side}" hidden><h4 class="diplomacy-trade-subhead">${side === "give" ? "Return a town" : "Ask for a town back"}</h4><div class="diplomacy-trade-goods" data-trade-town-list="${side}"></div></div>`;

const townRowHtml = (town: ReturnableTown, side: TownSide, chosen: boolean, disabled: boolean): string =>
  `<button type="button" class="diplomacy-trade-good" data-trade-town="${townRefKey(town)}" data-trade-town-side="${side}" aria-pressed="${chosen}" data-chosen="${chosen}"${disabled ? " disabled" : ""}>
    <span class="diplomacy-trade-good-icon" aria-hidden="true"><img src="${navTabIconUrl("towns")}" alt="" draggable="false"></span>
    <span class="diplomacy-trade-good-name"><span class="diplomacy-trade-good-label">${escapeHtml(town.name ?? "Town")}</span>
      <span class="diplomacy-trade-good-have">${TIER_LABEL[town.tier]} · ${town.x}, ${town.y}</span></span>
    <span class="diplomacy-trade-good-amount">${chosen ? "✓" : ""}</span>
  </button>`;

/** Lists one side's towns; hidden with none to return. Off (but still removable) when the deal can't carry them. */
export const renderTownReturn = (overlay: HTMLElement, view: { towns: readonly ReturnableTown[]; terms: DiplomacyTerms; kind: TradeKind; side?: TownSide }): void => {
  const side = view.side ?? "give";
  const section = overlay.querySelector<HTMLElement>(`[data-trade-towns="${side}"]`);
  const list = overlay.querySelector<HTMLElement>(`[data-trade-town-list="${side}"]`);
  if (!section || !list) return;
  section.hidden = view.towns.length === 0;
  const chosen = new Set(sideTowns(view.terms, side).map(townRefKey));
  const full = chosen.size >= MAX_TOWNS_PER_DEAL;
  const allowed = townsAllowedFor(view.kind, side);
  section.title = allowed ? "" : side === "give" ? "Towns are returned only in a truce, or as a gift to an AI empire." : "Towns are asked back only in a truce.";
  list.innerHTML = view.towns.map((town) => {
    const isChosen = chosen.has(townRefKey(town));
    return townRowHtml(town, side, isChosen, !isChosen && (!allowed || full));
  }).join("");
};

/** The deal column's line for each returned town, with a ✕ to take it out. */
export const dealTownItemsHtml = (terms: DiplomacyTerms, side: TownSide, nameOf?: (town: DiplomacyTownRef) => string | undefined, removable = side === "give"): string =>
  sideTowns(terms, side).map((town) => `<li class="diplomacy-deal-item" data-deal-town="${townRefKey(town)}">
      <span><b>Return</b> ${escapeHtml(townLabel(town, nameOf?.(town)))}</span>
      ${removable ? `<button type="button" class="diplomacy-deal-remove" data-deal-remove-town="${townRefKey(town)}" data-trade-town-side="${side}" aria-label="Take the town at ${town.x}, ${town.y} out of the deal">✕</button>` : ""}
    </li>`).join("");

const parseKey = (key: string | undefined): DiplomacyTownRef | undefined => {
  const [x, y] = (key ?? "").split(",").map(Number);
  return Number.isInteger(x) && Number.isInteger(y) ? { x: x!, y: y! } : undefined;
};

/** Pressing a town in the list, or its ✕ in the deal, toggles it. */
export const bindTownReturn = (overlay: HTMLElement, onToggle: (town: DiplomacyTownRef, side: TownSide) => void): void => {
  overlay.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-trade-town], [data-deal-remove-town]") : null;
    const town = parseKey(target?.dataset.tradeTown ?? target?.dataset.dealRemoveTown);
    if (town) onToggle(town, target?.dataset.tradeTownSide === "ask" ? "ask" : "give");
  });
};
