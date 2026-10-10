// The "Settle Land" tile-menu action for a FRONTIER tile: what settling it gains and costs in upkeep, plus a
// "settle these automatically from now on" checkbox under the button. The checkbox flips that tile's
// category in the player's server-side auto-settle prefs (shared auto-settle-prefs.ts, same ones the
// Settings panel edits). Nothing pops up on its own: this lives entirely inside the tile menu.
import { autoSettleCategoryForTile, townFoodSlotDemandForTier, type AutoSettleCategory } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { loadedAutoSettleState } from "./client-auto-settle-prefs.js";

export type AutoSettleOption = { category: AutoSettleCategory; checked: boolean; label: string };

const RESOURCE_LABELS: Record<string, string> = { TITANIUM: "titanium", UMBRITE: "umbrite", CRYSTAL: "crystal", GEMS: "gems" };

const OPTION_LABELS: Record<AutoSettleCategory, string> = {
  towns: "Settle towns, docks and the tiles around them automatically from now on",
  food: "Settle farms and fish automatically from now on",
  resources: "Settle resource tiles automatically from now on"
};

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
  return { category, checked: state.autoSettle.prefs[category], label: OPTION_LABELS[category] };
};

export const autoSettleOptionHtml = (option: AutoSettleOption): string =>
  `<label class="tile-auto-settle-option"><input type="checkbox" data-tile-auto-settle="${option.category}" ${option.checked ? "checked" : ""} /> ${option.label}</label>`;

/** One document-level listener (the tile menu re-renders its HTML constantly, so no per-render binding). Idempotent per document. */
export const installAutoSettleTileOptionBinding = (state: ClientState, send: (payload: unknown) => boolean): void => {
  if (typeof document === "undefined") return;
  const doc = document as Document & { __autoSettleTileOptionBound?: boolean };
  if (doc.__autoSettleTileOptionBound) return;
  doc.__autoSettleTileOptionBound = true;
  document.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement | null;
    const category = box?.matches?.("[data-tile-auto-settle]") ? (box.dataset.tileAutoSettle as AutoSettleCategory) : undefined;
    if (!box || !category || state.autoSettle.status !== "loaded") return;
    const { towns, food, resources } = state.autoSettle.prefs;
    const prefs = { towns, food, resources, [category]: box.checked };
    if (!send({ type: "SET_AUTO_SETTLE_PREFS", ...prefs })) {
      box.checked = !box.checked; // not signed in yet: nothing was sent, so don't pretend it took
      return;
    }
    state.autoSettle = loadedAutoSettleState({ answered: true, ...prefs }); // optimistic; the server's PLAYER_UPDATE confirms
  });
};
