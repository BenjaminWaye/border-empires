// Town screen for the new HUD. Opens when you select one of your towns, or a
// tile in its support ring (that tile stays highlighted and becomes the build
// target). Town info on the left, the build list on the right, Raise flag /
// Overclock at the bottom. All actions reuse the tile menu's own definitions.

import { townFoodSlotDemandForTier } from "@border-empires/shared";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { buildCategories, buildListHtml, buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { displayTownPopulationTierLabel, townNextPopulationMilestone } from "../client-town-growth/client-town-growth.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

export type TownScreenInput = {
  town: Tile;
  focus: Tile;
  townView: TileMenuView;
  focusView: TileMenuView;
  townIndex: number;
  townCount: number;
  buildSelection: string | undefined;
  category: BuildingCategory | undefined;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (v: number): string => Math.round(v).toLocaleString("en-US");

const GROW_IDS = new Set<TileActionDef["id"]>(["grow_settlement_to_town", "grow_town_to_city", "grow_city_to_great_city", "grow_great_city_to_monumental_city"]);

const targetAttrs = (a: TileActionDef, fallbackKey: string): string =>
  ` data-target-key="${esc(a.targetKey ?? fallbackKey)}"${a.originKey ? ` data-origin-key="${esc(a.originKey)}"` : ""}`;

const keyOf = (t: Tile): string => `${t.x},${t.y}`;

/** Categories that have something to build here, in the build menu's order. */
export const townBuildCategories = buildCategories;

const actionFor = (view: TileMenuView, id: TileActionDef["id"]): TileActionDef | undefined =>
  view.actions.find((a) => a.id === id) ?? view.buildings.find((a) => a.id === id);

const leftPanelHtml = (input: TownScreenInput): string => {
  const town = input.town.town;
  if (!town) return "";
  const name = town.name ?? input.townView.title;
  const nextTier = town.nextPopulationTierUpgrade;
  const milestone = townNextPopulationMilestone(town);
  const target = nextTier?.requiredPopulation ?? milestone?.targetPopulation;
  const growthPct = target ? Math.min(100, Math.round((town.population / target) * 100)) : 100;
  const growthLabel = milestone ? `Growth to ${milestone.label}` : "Population";
  const stats = [
    { k: "COIN", v: `+${fmt(town.goldPerMinute * 60)}/h`, n: town.isFed ? "Fed" : "Unfed", tone: town.isFed ? "" : " v2t-warn" },
    { k: "MANPOWER CAP", v: town.manpowerCap !== undefined ? `+${fmt(town.manpowerCap)}` : "—", n: "", tone: " v2t-gold" },
    { k: "FOOD UPKEEP", v: `${townFoodSlotDemandForTier(town.populationTier)} slots`, n: "", tone: "" },
    { k: "SUPPORT RING", v: `${town.supportCurrent} / ${town.supportMax}`, n: "", tone: "" }
  ];
  const built = (town.townModifierTotals ?? []).map((g) => `<div class="v2t-built"><span class="v2t-built-ico" aria-hidden="true"></span><span><span class="v2t-built-name">${esc(g.heading)}</span><span class="v2t-built-mods">${g.modifiers.map((m) => `<span class="v2t-mod-${m.tone}">${esc(m.statLabel)} ${esc(m.valueText)}</span>`).join(" · ")}</span></span></div>`).join("");
  const grow = [...input.townView.actions, ...input.townView.buildings].find((a) => GROW_IDS.has(a.id));
  const growHtml = grow
    ? `<button type="button" class="v2s-btn v2s-btn-primary v2t-grow" data-hud-v2-action="${esc(grow.id)}"${targetAttrs(grow, keyOf(input.town))}${grow.disabled ? " disabled" : ""} title="${esc(grow.disabled ? grow.disabledReason ?? "" : grow.detail ?? "")}">${esc(grow.label)}</button>${grow.cost ? `<span class="v2t-grow-cost">${esc(grow.cost)}</span>` : ""}${grow.disabled && grow.disabledReason ? `<span class="v2t-grow-why">${esc(grow.disabledReason)}</span>` : ""}`
    : "";
  return `<div class="v2t-name-row">
      <button type="button" class="v2t-step" data-v2-town-step="-1" aria-label="Previous town"${input.townCount > 1 ? "" : " disabled"}>◁</button>
      <span class="v2t-name"><span class="v2t-title">${esc(name)}</span><span class="v2t-sub">${displayTownPopulationTierLabel(town.populationTier)} · ${town.type === "MARKET" ? "Market town" : "Farming town"}</span></span>
      <button type="button" class="v2t-step" data-v2-town-step="1" aria-label="Next town"${input.townCount > 1 ? "" : " disabled"}>▷</button>
    </div>
    <div class="v2t-growth"><div class="v2t-growth-row"><span>${growthLabel}</span><span>${fmt(town.population)}${target ? ` / ${fmt(target)}` : ""}</span></div><div class="v2t-bar"><span style="width:${growthPct}%"></span></div></div>
    <div class="v2t-stats">${stats.map((s) => `<div class="v2t-stat"><span class="v2t-stat-k">${s.k}</span><span class="v2t-stat-v${s.tone}">${s.v}</span>${s.n ? `<span class="v2t-stat-n">${s.n}</span>` : ""}</div>`).join("")}</div>
    ${built ? `<div class="v2t-h">In this town</div><div class="v2t-built-list" data-v2-scroll="town-built">${built}</div>` : ""}
    <div class="v2t-grow-wrap">${growHtml}</div>`;
};

const buildPanelHtml = (input: TownScreenInput): string => {
  const supportFocus = keyOf(input.focus) !== keyOf(input.town);
  return buildListHtml({
    buildings: input.focusView.buildings,
    focusLabel: supportFocus ? `(${input.focus.x}, ${input.focus.y})` : input.townView.title,
    focusHighlighted: supportFocus,
    selection: input.buildSelection,
    category: input.category,
    emptyText: `Nothing to build ${supportFocus ? "on this tile" : "here"}`,
    targetKey: keyOf(input.focus),
    placeLabel: supportFocus ? `Build on (${input.focus.x}, ${input.focus.y})` : "Place"
  });
};

const placeHtml = (input: TownScreenInput): string => {
  const supportFocus = keyOf(input.focus) !== keyOf(input.town);
  return buildPlaceHtml({
    buildings: input.focusView.buildings,
    selection: input.buildSelection,
    targetKey: keyOf(input.focus),
    placeLabel: supportFocus ? `Build on (${input.focus.x}, ${input.focus.y})` : "Place"
  });
};

const barHtml = (input: TownScreenInput): string => {
  const btn = (a: TileActionDef | undefined, label: string): string =>
    a
      ? `<button type="button" class="v2t-act" data-hud-v2-action="${esc(a.id)}"${targetAttrs(a, keyOf(input.town))}${a.disabled ? " disabled" : ""} title="${esc(a.disabled ? a.disabledReason ?? "" : a.detail ?? "")}">${label}${a.cost ? `<small>${esc(a.cost)}</small>` : ""}</button>`
      : "";
  // Everything else the town tile offers, as small text buttons (no hidden ⋯ menu).
  const shownIds = new Set<TileActionDef["id"]>(["muster_hold", "city_overclock", ...GROW_IDS]);
  const minor = input.townView.actions.filter((a) => !shownIds.has(a.id)).map((a) =>
    `<button type="button" class="hud-v2-minor${a.disabled ? " hud-v2-minor-off" : ""}" data-hud-v2-action="${esc(a.id)}"${targetAttrs(a, keyOf(input.town))}${a.disabled ? " disabled" : ""} title="${esc(a.disabled ? a.disabledReason ?? a.label : a.cost ?? a.detail ?? a.label)}">${esc(a.label)}</button>`).join("");
  return `${btn(actionFor(input.townView, "muster_hold"), "Raise flag")}${btn(actionFor(input.townView, "city_overclock"), "Overclock")}
    ${minor ? `<span class="v2t-minor">${minor}</span>` : ""}
    <button type="button" class="v2t-act v2t-act-back" data-v2-close>◁ Map · Esc</button>`;
};

export const townScreenRegions = (input: TownScreenInput): { left: string; build: string; place: string; bar: string } => ({
  left: leftPanelHtml(input),
  build: buildPanelHtml(input),
  place: placeHtml(input),
  bar: barHtml(input)
});

export const TOWN_SCREEN_SKELETON = `<section class="v2t-left" id="v2t-left" aria-label="Town"></section>
  <section class="v2t-right" id="v2t-build" aria-label="Build"></section>
  <div class="v2t-place-slot" id="v2t-place"></div>
  <div class="v2t-bar" id="v2t-bar"></div>`;
