// The build list shared by the town screen and the map's Build ▸ sidebar:
// category tabs, one row per building with its cost or why it can't be built,
// and a Place button for the picked one. Picks and tabs carry
// data-v2-build-pick / data-v2-build-category; Place is a normal tile action.

import { buildActionIconHtml } from "../client-build-menu-icons/client-build-menu-icons.js";
import {
  BUILDING_CATEGORY_LABELS,
  BUILDING_CATEGORY_ORDER,
  buildingActionCategory,
  type BuildingCategory
} from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import type { TileActionDef } from "../client-types.js";

export type BuildListInput = {
  buildings: readonly TileActionDef[];
  /** Shown top-right: the tile being built on. */
  focusLabel: string;
  focusHighlighted: boolean;
  selection: string | undefined;
  category: BuildingCategory | undefined;
  emptyText: string;
  /** Tile the Place button builds on when the action carries no target of its own. */
  targetKey: string;
  placeLabel: string;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Categories that have something to build here, in the build menu's order. */
export const buildCategories = (buildings: readonly TileActionDef[]): Array<{ category: BuildingCategory; count: number }> =>
  BUILDING_CATEGORY_ORDER.map((category) => ({ category, count: buildings.filter((b) => buildingActionCategory(b) === category).length })).filter((c) => c.count > 0);

export const buildListHtml = (input: BuildListInput): string => {
  const cats = buildCategories(input.buildings);
  const category = cats.some((c) => c.category === input.category) ? input.category : cats[0]?.category;
  const tabs = cats.map((c) => `<button type="button" role="tab" class="v2t-tab${c.category === category ? " v2t-tab-on" : ""}" aria-selected="${c.category === category}" data-v2-build-category="${c.category}">${esc(BUILDING_CATEGORY_LABELS[c.category].replace(/­/g, ""))} · ${c.count}</button>`).join("");
  const rows = input.buildings.filter((b) => buildingActionCategory(b) === category).map((b) => {
    const on = b.id === input.selection;
    return `<button type="button" class="v2t-build${on ? " v2t-build-on" : ""}${b.disabled ? " v2t-build-off" : ""}" data-v2-build-pick="${esc(b.id)}" aria-pressed="${on}">
      <span class="v2t-build-ico">${buildActionIconHtml(b.id) ?? ""}</span>
      <span class="v2t-build-text"><span class="v2t-build-name">${esc(b.label)}</span>${b.detail ? `<span class="v2t-build-detail">${esc(b.detail)}</span>` : ""}<span class="v2t-build-cost${b.disabled ? " v2t-warn" : ""}">${esc(b.disabled ? b.disabledReason ?? "Unavailable" : b.cost ?? "")}</span></span>
    </button>`;
  }).join("");
  const empty = input.buildings.length === 0 ? `<div class="v2s-empty">${esc(input.emptyText)}</div>` : "";
  return `<div class="v2t-build-head"><span class="v2t-build-title">Build</span><span class="v2t-focus${input.focusHighlighted ? " v2t-focus-on" : ""}">${esc(input.focusLabel)}</span></div>
    ${tabs ? `<div class="v2t-tabs" role="tablist" aria-label="Building categories">${tabs}</div>` : ""}
    <div class="v2t-build-list" data-v2-scroll="build-list">${rows}${empty}</div>`;
};

export const buildPlaceHtml = (input: Pick<BuildListInput, "buildings" | "selection" | "targetKey" | "placeLabel">): string => {
  const sel = input.buildings.find((b) => b.id === input.selection && !b.disabled);
  if (!sel) return "";
  const target = ` data-target-key="${esc(sel.targetKey ?? input.targetKey)}"${sel.originKey ? ` data-origin-key="${esc(sel.originKey)}"` : ""}`;
  return `<div class="v2t-place"><span class="v2t-place-name">${esc(sel.label)}</span><button type="button" class="v2s-btn v2s-btn-primary" data-hud-v2-action="${esc(sel.id)}"${target}>${esc(input.placeLabel)}</button></div>`;
};
