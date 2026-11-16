// The "Settle Land" tile-menu action for a FRONTIER tile: what settling it gains and costs in upkeep, plus a
// "settle these automatically from now on" checkbox under the button. The checkbox flips that tile's
// category (towns, or that one resource) in the player's server-side auto-settle prefs (shared auto-settle-prefs.ts, same ones the
// Settings panel edits). Until a category is answered, a Yes/No question replaces the checkbox (new players
// missed the small box); "No" swaps in the checkbox, highlighted. All of it lives inside the tile menu.
import { AUTO_SETTLE_CATEGORIES, autoSettleCategoryForTile, townFoodSlotDemandForTier, type AutoSettleCategory } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { autoSettleCategoryLabel } from "./client-auto-settle-labels.js";
import { hasAskedAutoSettle, isDeclinedHighlightActive, highlightDeclinedAutoSettle, markAutoSettleAsked } from "./client-auto-settle-ask.js";
import { loadedAutoSettleState } from "./client-auto-settle-prefs.js";

/** checked is the value when the view was built; the HTML re-reads live prefs (cached views repaint stale copies). */
export type AutoSettleOption = { category: AutoSettleCategory; checked: boolean; label: string; tileKey: string };

/** What the binding was last installed with: markup built from a cached view still shows the live answer. */
let liveState: ClientState | undefined;
let liveSend: ((payload: unknown) => boolean) | undefined;

const RESOURCE_LABELS: Record<string, string> = { TITANIUM: "titanium", UMBRITE: "umbrite", CRYSTAL: "crystal", GEMS: "gems" };

const optionLabel = (category: AutoSettleCategory): string =>
  category === "towns"
    ? "Garrison towns, docks and the tiles around them automatically from now on"
    : `Garrison ${autoSettleCategoryLabel(category).toLowerCase()} tiles automatically from now on`;

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** "Gain: … Upkeep: …" for settling this tile; empty for a plain tile with nothing to report. */
export const settleOutcomeText = (state: Pick<ClientState, "resourceSlots">, tile: Tile): string => {
  const gains: string[] = [];
  const upkeep: string[] = [];
  if (tile.town) {
    gains.push("+ Coin", "+ Manpower");
    const demand = townFoodSlotDemandForTier(tile.town.populationTier);
    if (demand > 0) {
      const short = state.resourceSlots.demand.FOOD + demand - state.resourceSlots.supply.FOOD;
      upkeep.push(`${plural(demand, "food slot")}${short > 0 ? ` (${short} short – idle until you garrison more food)` : ""}`);
    }
  } else if (tile.dockId) {
    gains.push("+ Coin");
  } else if (tile.resource === "FARM" || tile.resource === "FISH") {
    gains.push(`+${plural(tile.resource === "FISH" ? 2 : 1, "food slot")}`);
  } else if (tile.resource) {
    gains.push(`+1 ${RESOURCE_LABELS[tile.resource] ?? tile.resource.toLowerCase()} slot`);
  }
  if (gains.length === 0) return "";
  return `Gain: ${gains.join(", ")}. Upkeep: ${upkeep.length > 0 ? upkeep.join(", ") : "none"}.`;
};

/**
 * Undefined until the server has told us the player's prefs (we can't show a checkbox state we don't know),
 * and for natural wonders: the shared category function has no wonder bucket, so one would silently fall into
 * the "towns" setting and the label would be wrong. Wonders are rare and strategic, so settling is a manual click.
 */
export const autoSettleOptionForTile = (state: Pick<ClientState, "autoSettle">, tile: Tile): AutoSettleOption | undefined => {
  if (state.autoSettle.status !== "loaded" || tile.naturalWonder) return undefined;
  const category = autoSettleCategoryForTile(tile);
  return { category, checked: state.autoSettle.prefs[category], label: optionLabel(category), tileKey: `${tile.x},${tile.y}` };
};

const liveChecked = (option: AutoSettleOption): boolean =>
  liveState?.autoSettle.status === "loaded" ? liveState.autoSettle.prefs[option.category] : option.checked;

const askHtml = (option: AutoSettleOption): string =>
  `<div class="tile-auto-settle-ask" role="group" aria-label="Automatic garrison" data-tile-auto-settle-ask="${option.category}" data-tile-key="${option.tileKey}">` +
  `<span class="tile-auto-settle-ask-question">${option.label}?</span>` +
  `<span class="tile-auto-settle-ask-buttons">` +
  `<button type="button" class="tile-auto-settle-ask-btn is-yes" data-tile-auto-settle-answer="yes">Yes</button>` +
  `<button type="button" class="tile-auto-settle-ask-btn" data-tile-auto-settle-answer="no">No</button>` +
  `</span></div>`;

const checkboxHtml = (option: AutoSettleOption, checked: boolean, highlighted: boolean): string =>
  `<label class="tile-auto-settle-option${highlighted ? " is-highlighted" : ""}"><input type="checkbox" data-tile-auto-settle="${option.category}" ${checked ? "checked" : ""} /> ${option.label}${highlighted ? `<span class="tile-auto-settle-hint">Change anytime</span>` : ""}</label>`;

/** Off and never answered: a Yes/No question. Otherwise the checkbox, highlighted for a short while after a "No". */
export const autoSettleOptionHtml = (option: AutoSettleOption): string => {
  const checked = liveChecked(option);
  if (!checked && !hasAskedAutoSettle(option.category)) return askHtml(option);
  return checkboxHtml(option, checked, isDeclinedHighlightActive(option.category));
};

/** Sends all categories with only `category` changed; false (and no state change) when it could not be sent. */
const sendCategoryPref = (state: ClientState, send: (payload: unknown) => boolean, category: AutoSettleCategory, on: boolean): boolean => {
  if (state.autoSettle.status !== "loaded") return false;
  const current = state.autoSettle.prefs;
  const prefs = Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((c) => [c, c === category ? on : current[c]])) as Record<AutoSettleCategory, boolean>;
  if (!send({ type: "SET_AUTO_SETTLE_PREFS", ...prefs })) return false;
  state.autoSettle = loadedAutoSettleState({ ...current, answered: true, ...prefs }); // optimistic (improve switches kept); the server's PLAYER_UPDATE confirms
  return true;
};

const answerQuestion = (state: ClientState, send: (payload: unknown) => boolean, button: HTMLElement): void => {
  const ask = button.closest<HTMLElement>("[data-tile-auto-settle-ask]");
  const category = ask?.dataset.tileAutoSettleAsk as AutoSettleCategory | undefined;
  const tileKey = ask?.dataset.tileKey;
  const label = ask?.querySelector(".tile-auto-settle-ask-question")?.textContent?.replace(/\?$/, "");
  if (!ask?.isConnected || !category || !tileKey || !label || state.autoSettle.status !== "loaded") return;
  const yes = button.dataset.tileAutoSettleAnswer === "yes";
  if (yes && !sendCategoryPref(state, send, category, true)) return; // not signed in yet: keep asking
  markAutoSettleAsked(category);
  if (!yes) highlightDeclinedAutoSettle(category);
  // Swap in place so the answer shows at once; the menu's next render produces the same markup. The box shows the
  // live pref, not the answer: Yes in another panel may already have turned this category on.
  const option = { category, checked: yes, label, tileKey };
  const holder = document.createElement("div");
  holder.innerHTML = checkboxHtml(option, liveChecked(option), !yes);
  const replacement = holder.firstElementChild;
  if (!replacement) return;
  ask.replaceWith(replacement);
  replacement.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); // keyboard users keep their place
};

/** One document-level listener (the tile menu re-renders its HTML constantly, so no per-render binding). Idempotent per document. */
export const installAutoSettleTileOptionBinding = (state: ClientState, send: (payload: unknown) => boolean): void => {
  liveState = state;
  liveSend = send;
  if (typeof document === "undefined") return;
  const doc = document as Document & { __autoSettleTileOptionBound?: boolean };
  if (doc.__autoSettleTileOptionBound) return;
  doc.__autoSettleTileOptionBound = true;
  document.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement | null;
    const category = box?.matches?.("[data-tile-auto-settle]") ? (box.dataset.tileAutoSettle as AutoSettleCategory) : undefined;
    if (!box || !category || !liveState || !liveSend || liveState.autoSettle.status !== "loaded") return;
    if (!sendCategoryPref(liveState, liveSend, category, box.checked)) {
      box.checked = !box.checked; // not signed in yet: nothing was sent, so don't pretend it took
      return;
    }
    markAutoSettleAsked(category);
  });
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>("[data-tile-auto-settle-answer]");
    if (button && liveState && liveSend) answerQuestion(liveState, liveSend, button);
  });
};
