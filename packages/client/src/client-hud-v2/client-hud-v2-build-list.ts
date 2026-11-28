import { autoImproveOptionHtml, isResourceImprovementAction, type AutoImproveOption } from "./client-resource-improvement-action.js";
import type { BuildPlacedOutcome } from "../client-queue-logic/client-build-placed-feedback.js";
// The build list shared by the town screen and the map's Build ▸ sidebar:
// category tabs, one row per building with its cost or why it can't be built,
// and a Place button for the picked one. Picks and tabs carry
// data-v2-build-pick / data-v2-build-category; Place is a normal tile action.

import { buildActionIconHtml } from "../client-build-menu-icons/client-build-menu-icons.js";
import {
  BUILDING_CATEGORY_LABELS,
  BUILDING_CATEGORY_ORDER,
  buildingActionCategory,
  initialBuildingCategory,
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
  /** Panel title; "Build" when absent. */
  title?: string;
  /** Shown between the title and the tabs (the town screen's work cards); the list then gets its own Build heading, and no empty text. */
  leadHtml?: string;
  /** The map's Build ▸ sheet: adds a ✕ that shuts that bar panel (phones have no Esc, and the sheet fills the screen). */
  closePanel?: "build" | "aether";
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PANEL_NAME = { build: "Build", aether: "Aether", modules: "Modules", commit: "Attack commitment", reports: "Combat reports" } as const;

/** The ✕ in a sidebar sheet's head (Build ▸, Aether ▸, a tile view); the dock's click handler shuts that panel. */
export const buildPanelCloseHtml = (panel: keyof typeof PANEL_NAME): string =>
  `<button type="button" class="v2t-build-close" data-hud-v2-panel-close="${panel}" aria-label="Close ${PANEL_NAME[panel]}">✕</button>`;

/** Categories that have something to build here, in the build menu's order. */
export const buildCategories = (buildings: readonly TileActionDef[]): Array<{ category: BuildingCategory; count: number }> =>
  BUILDING_CATEGORY_ORDER.map((category) => ({ category, count: buildings.filter((b) => buildingActionCategory(b) === category).length })).filter((c) => c.count > 0);

/**
 * The tab a build list opens on: the one holding a recommended building (the tutorial guide's
 * Manufactory, an onboarding Relay Beacon), so the guide teaches players to find it in Build.
 */
export const defaultBuildCategory = (buildings: readonly TileActionDef[]): BuildingCategory | undefined => {
  const recommended = buildings.find((b) => b.recommended);
  return recommended ? buildingActionCategory(recommended) : initialBuildingCategory(buildCategories(buildings).map((c) => c.category));
};

const RECOMMENDED_BADGE = `<span class="v2t-build-rec-badge">★ Recommended</span>`;

/**
 * One building row. A row locked by research is greyed and its requirement is a link to that research in the
 * Manifest (data-view-tech), a sibling of the row so the row stays one button (owner, First-15 round 1).
 */
const buildRowHtml = (b: TileActionDef, on: boolean): string => {
  const locked = Boolean(b.disabled && b.techLinkId);
  const note = locked ? "" : `<span class="v2t-build-cost${b.disabled ? " v2t-warn" : ""}">${esc(b.disabled ? b.disabledReason ?? "Unavailable" : b.cost ?? "")}</span>`;
  const row = `<button type="button" class="v2t-build${on ? " v2t-build-on" : ""}${b.recommended ? " v2t-build-rec" : ""}${b.disabled ? " v2t-build-off" : ""}${locked ? " v2t-build-locked" : ""}" data-v2-build-pick="${esc(b.id)}" aria-pressed="${on}">
      <span class="v2t-build-ico">${buildActionIconHtml(b.id) ?? ""}</span>
      <span class="v2t-build-text"><span class="v2t-build-name">${esc(b.label)}${b.recommended ? RECOMMENDED_BADGE : ""}</span>${b.detail ? `<span class="v2t-build-detail">${esc(b.detail)}</span>` : ""}${note}</span>
    </button>`;
  if (!locked) return row;
  const why = b.disabledReason ?? "Requires research";
  return `<div class="v2t-build-item v2t-build-item-locked">${row}<button type="button" class="v2t-build-tech" data-view-tech="${esc(b.techLinkId!)}" title="Open in the Manifest">${esc(why)} →</button></div>`;
};

export const buildListHtml = (input: BuildListInput): string => {
  const cats = buildCategories(input.buildings);
  const category = cats.some((c) => c.category === input.category) ? input.category : defaultBuildCategory(input.buildings);
  const recommendedIn = new Set(input.buildings.filter((b) => b.recommended).map(buildingActionCategory));
  const tabs = cats.map((c) => `<button type="button" role="tab" class="v2t-tab${c.category === category ? " v2t-tab-on" : ""}" aria-selected="${c.category === category}" data-v2-build-category="${c.category}">${recommendedIn.has(c.category) ? "★ " : ""}${esc(BUILDING_CATEGORY_LABELS[c.category].replace(/­/g, ""))} · ${c.count}</button>`).join("");
  // A recommended building leads its tab, marked like the tile menu's "★ Recommended".
  const inTab = input.buildings.filter((b) => buildingActionCategory(b) === category);
  const rows = [...inTab.filter((b) => b.recommended), ...inTab.filter((b) => !b.recommended)].map((b) => buildRowHtml(b, b.id === input.selection)).join("");
  const empty = input.buildings.length === 0 && !input.leadHtml ? `<div class="v2s-empty">${esc(input.emptyText)}</div>` : "";
  const lead = input.leadHtml ? `${input.leadHtml}${input.buildings.length > 0 ? `<div class="v2t-h">Build</div>` : ""}` : "";
  return `<div class="v2t-build-head"><span class="v2t-build-title">${esc(input.title ?? "Build")}</span><span class="v2t-focus${input.focusHighlighted ? " v2t-focus-on" : ""}">${esc(input.focusLabel)}</span>${input.closePanel ? buildPanelCloseHtml(input.closePanel) : ""}</div>
    ${lead}
    ${tabs ? `<div class="v2t-tabs" role="tablist" aria-label="Building categories">${tabs}</div>` : ""}
    <div class="v2t-build-list" data-v2-scroll="build-list">${rows}${empty}</div>`;
};

/** The Place button's brief confirmation after a press (see buildPlacedPresses); it stays pressable for the next one. */
const PLACED_LABELS: Record<BuildPlacedOutcome, string> = { started: "✓ Placed", queued: "✓ Queued" };

/** The picked building's Place button: a box of its own, or `docked` at the foot of the build panel (the town screen). */
export const buildPlaceHtml = (input: Pick<BuildListInput, "buildings" | "selection" | "targetKey" | "placeLabel"> & {
  docked?: boolean;
  placed?: BuildPlacedOutcome | undefined;
  /** The tile's auto-improve toggle (client-resource-improvement-action.ts), shown under a resource improvement's Place. */
  autoImprove?: AutoImproveOption | undefined;
}): string => {
  const sel = input.buildings.find((b) => b.id === input.selection && !b.disabled);
  if (!sel) return "";
  const target = ` data-target-key="${esc(sel.targetKey ?? input.targetKey)}"${sel.originKey ? ` data-origin-key="${esc(sel.originKey)}"` : ""}`;
  const bulk = input.autoImprove && isResourceImprovementAction(sel.id) ? autoImproveOptionHtml(input.autoImprove) : "";
  return `<div class="v2t-place${input.docked ? " v2t-place-docked" : ""}"><span class="v2t-place-name">${esc(sel.label)}</span><button type="button" class="v2s-btn v2s-btn-primary${input.placed ? " v2t-place-done" : ""}" data-hud-v2-action="${esc(sel.id)}"${target}>${esc(input.placed ? PLACED_LABELS[input.placed] : input.placeLabel)}</button>${bulk}</div>`;
};
