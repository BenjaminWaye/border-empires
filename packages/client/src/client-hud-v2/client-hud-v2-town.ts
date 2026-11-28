// Town screen for the new HUD. Opens when you select one of your towns, or a
// tile in its support ring (that tile stays highlighted and becomes the build
// target). Town info on the left, the build list on the right (titled In
// progress, with a card per build, while the selected tile has work on it; the
// picked building's Build on button docks at its foot), Raise flag / Overclock
// at the bottom. All actions reuse the tile menu's own definitions.

import { tileCoinPerMinute } from "../client-coin-income/client-coin-income.js";
import { townCoinNote, townPlotIncomeNote, townZeroCoinReason } from "../client-town-plot-income/client-town-plot-income.js";
import { biotaAdjustedTownManpower, manpowerPerBatch, townFoodSlotDemandForTier } from "@border-empires/shared";
import { townFoodSlotDemand } from "../client-town-food-demand/client-town-food-demand.js";
import type { ClientAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { townCharacterLabelForProfile, townStatModifiersForProfile } from "../client-town-terrain-modifiers/client-town-terrain-modifiers.js";
import { townTerrainForTile } from "../client-town-terrain-modifiers/client-town-tile-terrain.js";
import { townGoldBonuses } from "../client-town-stat-bonuses/client-town-stat-bonuses.js";
import type { BuildingCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { autoSettleOptionForTile, autoSettleOptionHtml } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { availableResourceImprovement, isGarrison } from "./client-hud-v2-action-bar.js";
import { STRUCTURE_TOGGLE_ACTION_IDS } from "../client-observatory-toggle/client-observatory-toggle.js";
import { buildCategories, buildListHtml, buildPlaceHtml, defaultBuildCategory } from "./client-hud-v2-build-list.js";
import { minorActionButtonHtml } from "./client-hud-v2-minor-button.js";
import { foodFixButtonHtml } from "./client-hud-v2-food-shortage.js";
import { autoImproveOptionForTile } from "./client-resource-improvement-action.js";
import { townWorkHtml } from "./client-hud-v2-town-work.js";
import { townFocusCardHtml, type TownFocusCardExtras } from "./client-hud-v2-town-focus.js";
import { shownTownFocus, townFocusCard, townGrowthEtaPrecise } from "../client-town-focus/client-town-focus.js";
import { TOWN_FOCUS_MULTIPLIERS } from "@border-empires/shared";
import { townBiota } from "./client-hud-v2-town-biota.js";
import type { BiotaStep } from "./client-hud-v2-town-biota-steps.js";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";
import { builtStructureFacts, townGrowth, type DormantResourcesFor, type TileFact } from "./client-hud-v2-tile-facts.js";
import { displayTownPopulationTierLabel, townNextPopulationMilestone } from "../client-town-growth/client-town-growth.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import type { RefineryStatusOf } from "./client-hud-v2-refinery-gives.js";
import type { BuildPlacedOutcome } from "../client-queue-logic/client-build-placed-feedback.js";
import type { TownPlotGarrison } from "../client-town-plot-garrison/client-town-plot-garrison.js";

/** An ungarrisoned town gives no coin or manpower: "none" sent yet, or a garrison "on_its_way". */
export type TownGarrisonState = "none" | "on_its_way";

export type TownScreenInput = {
  town: Tile;
  focus: Tile;
  townView: TileMenuView;
  focusView: TileMenuView;
  townIndex: number;
  townCount: number;
  buildSelection: string | undefined;
  category: BuildingCategory | undefined;
  /** The selected tile's queued build's 1-based place in its queue tier; 0 or absent when it has none. */
  focusQueuePosition?: number;
  /** The work cards' buttons are locked while a rush or cancel waits on the server. */
  focusWorkLocked?: boolean;
  /** Absent once the town is garrisoned. */
  garrison?: TownGarrisonState | undefined;
  /** A garrisoned town's plots you hold but haven't garrisoned (client-town-plot-garrison.ts); absent when none. */
  plotGarrison?: TownPlotGarrison | undefined;
  /** Live prefs: the checkbox is read from these each render, not from the view snapshot taken when the screen opened. */
  autoSettle?: ClientAutoSettleState;
  /** The one-tap FOOD fix's label (client-food-fix-store.ts): offered under an unfed town's paused growth. */
  foodFixLabel?: string | undefined;
  /** Dormancy lookup (state.dormantStructures), so a building without its upkeep slot reads Dormant, not Active. */
  dormantResourcesFor?: DormantResourcesFor;
  /** The live status of a refinery standing on the selected tile, for its Gives line. */
  refineryStatusOf?: RefineryStatusOf;
  /** The "Build plots" card (client-hud-v2-town-plots.ts); the card is left out when absent. */
  plotsHtml?: string;
  /** A Place press's outcome while its confirmation shows on the button (set per press in runTileActionOn). */
  placed?: BuildPlacedOutcome | undefined;
  /** The picked building was already placed from this screen: once the confirmation fades, Place reads "Place another". */
  placedBefore?: boolean;
  /** This town's luxury biota supply (ManpowerBreakdown.biotaTowns); absent for a town that needs none. */
  biota?: BiotaTownStatus | undefined;
  /** What to do about a biota shortfall (client-hud-v2-town-biota-steps.ts). */
  biotaSteps?: readonly BiotaStep[];
  /** The local player, for the Town focus card's refill countdown; the card is left out when absent. */
  me?: string;
  /** Empire counts, empire manpower and the pick flash for the Town focus card. */
  focusExtras?: TownFocusCardExtras;
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

const ungarrisonedTown = (input: TownScreenInput): boolean => input.garrison !== undefined;

const leftPanelHtml = (input: TownScreenInput): string => {
  const town = input.town.town;
  if (!town) return "";
  const name = town.name ?? input.townView.title;
  const nextTier = town.nextPopulationTierUpgrade;
  const milestone = townNextPopulationMilestone(town);
  const target = nextTier?.requiredPopulation ?? milestone?.targetPopulation;
  const growthPct = target ? Math.min(100, Math.round((town.population / target) * 100)) : 100;
  const growthLabel = milestone ? `Growth to ${milestone.label}` : "Population";
  const growth = townGrowth(town);
  // A town still being garrisoned (or a partial summary) has no economy fields yet: show a dash, never NaN.
  const known = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const coinNote = townCoinNote(town);
  // Sabotage (or a lost garrison) is the one zero-coin cause the Fed/plots note doesn't already name.
  const zeroWhy = known(town.goldPerMinute) && tileCoinPerMinute(input.town) < 0.0001 ? townZeroCoinReason(input.town) : undefined;
  const fed = zeroWhy && !coinNote.includes(zeroWhy) ? [coinNote, zeroWhy].filter(Boolean).join(" · ") : coinNote;
  // Match the town overview's base contribution; optional manpowerCap is
  // not the town's tier-and-terrain contribution. Building bonuses stay below.
  const { terrainProfile, coastal } = townTerrainForTile(input.town, town);
  const character = townCharacterLabelForProfile(terrainProfile, coastal);
  const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n}%`;
  // A Standard Town's terrain is neutral: "+0% · +0% · +0%" read as a perk that had lost its numbers (Playtest Run 4).
  const terrainModsText = (m: { goldOutputPercent: number; manpowerCapacityPercent: number; manpowerRegenPercent: number }): string =>
    m.goldOutputPercent === 0 && m.manpowerCapacityPercent === 0 && m.manpowerRegenPercent === 0
      ? "No terrain bonus"
      : `Coin ${signed(m.goldOutputPercent)} · Manpower cap ${signed(m.manpowerCapacityPercent)} · Regen ${signed(m.manpowerRegenPercent)}`;
  const modifiers = townStatModifiersForProfile(terrainProfile, coastal).map((m) =>
    `<div class="v2t-built"><span><span class="v2t-built-name">${esc(m.label)}</span><span class="v2t-built-mods">${terrainModsText(m)}</span></span></div>`
  ).join("") + (typeof town.isFed === "boolean" ? townGoldBonuses(town, { includeBuildings: false, biota: input.biota }) : []).map((b) =>
    `<div class="v2t-built"><span><span class="v2t-built-name">${esc(b.label)}</span><span class="v2t-built-mods"><span class="v2t-mod-${b.tone}">${/^[+−]/.test(b.effect) ? "Coin " : ""}${esc(b.effect)}</span></span></span></div>`
  ).join("");
  // A large town short of biota gives part of its tier's manpower: show what it gives, and why.
  const biota = townBiota(town.populationTier, input.biota, input.biotaSteps);
  const manpower = biotaAdjustedTownManpower(town.populationTier, terrainProfile, coastal, input.biota);
  // The town's active focus scales its own regen (docs/town-focus-plan.md); the card projects each choice.
  const focusRegen = manpower.regenPerMinute * TOWN_FOCUS_MULTIPLIERS[shownTownFocus(town)].manpowerRegen;
  const focusCard = input.me && !ungarrisonedTown(input) ? townFocusCardHtml(townFocusCard(input.town, input.me, manpower.regenPerMinute), input.focusExtras) : "";
  // The simulation's per-town demand after waivers; the tier base only explains a waiver.
  const foodDemand = townFoodSlotDemand(town);
  const foodBase = townFoodSlotDemandForTier(town.populationTier);
  // An ungarrisoned town gives nothing yet, whether or not a coin figure has arrived: say so, not a bare dash.
  const ungarrisoned = input.garrison !== undefined;
  const stats = [
    // A town with its fed state but no coin figure is mid-refresh (the tile-detail request is in flight), not coinless.
    ungarrisoned
      ? input.garrison === "none"
        ? { k: "COIN", v: "Not garrisoned", n: "Garrison to start coin", tone: " v2t-warn" }
        : { k: "COIN", v: "Garrisoning…", n: "Starts once garrisoned", tone: "" }
      : { k: "COIN", v: known(town.goldPerMinute) ? `+${fmt(tileCoinPerMinute(input.town) * 1440)}/day` : typeof town.isFed === "boolean" ? "…" : "—", n: fed, tone: town.isFed === false || townPlotIncomeNote(town) || zeroWhy ? " v2t-warn" : "" },
    { k: "MANPOWER CAP", v: `+${fmt(manpower.cap)}`, n: ungarrisoned ? "Starts once garrisoned" : `${biota.unrulyNote ?? "Base town"} · +${fmt(manpowerPerBatch(focusRegen))} per refill`, tone: input.garrison === "none" || biota.unrulyNote ? " v2t-warn" : " v2t-gold" },
    { k: "FOOD UPKEEP", v: `${foodDemand} slots`, n: foodDemand < foodBase ? `${foodBase} base · ${foodBase - foodDemand} waived by upgrades` : "", tone: "" }
  ];
  const built = (town.townModifierTotals ?? []).map((g) => `<div class="v2t-built"><span class="v2t-built-ico" aria-hidden="true"></span><span><span class="v2t-built-name">${esc(g.heading)}</span><span class="v2t-built-mods">${g.modifiers.map((m) => `<span class="v2t-mod-${m.tone}">${esc(m.statLabel)} ${esc(m.valueText)}</span>`).join(" · ")}</span></span></div>`).join("");
  const grow = [...input.townView.actions, ...input.townView.buildings].find((a) => GROW_IDS.has(a.id));
  const growHtml = grow
    ? `<button type="button" class="v2s-btn v2s-btn-primary v2t-grow" data-hud-v2-action="${esc(grow.id)}"${targetAttrs(grow, keyOf(input.town))}${grow.disabled ? " disabled" : ""} title="${esc(grow.disabled ? grow.disabledReason ?? "" : grow.detail ?? "")}">${esc(grow.label)}</button>${grow.cost ? `<span class="v2t-grow-cost">${esc(grow.cost)}</span>` : ""}${grow.disabled && grow.disabledReason ? `<span class="v2t-grow-why">${esc(grow.disabledReason)}</span>` : ""}`
    : "";
  return `<div class="v2t-name-row">
      <button type="button" class="v2t-step" data-v2-town-step="-1" aria-label="Previous town"${input.townCount > 1 ? "" : " disabled"}>◁</button>
      <span class="v2t-name"><span class="v2t-title">${esc(name)}</span><span class="v2t-sub">${displayTownPopulationTierLabel(town.populationTier)} · ${esc(character)}</span></span>
      <button type="button" class="v2t-step" data-v2-town-step="1" aria-label="Next town"${input.townCount > 1 ? "" : " disabled"}>▷</button>
    </div>
    <div class="v2t-growth"><div class="v2t-growth-row"><span>${growthLabel}</span><span>${fmt(town.population)}${target ? ` / ${fmt(target)}` : ""}</span></div><div class="v2t-bar"><span style="width:${growthPct}%"></span></div>${growth ? `<div class="v2t-growth-row v2t-growth-rate${growth.paused ? " v2t-warn" : ""}"><span>${esc(growth.paused ? growth.eta : townGrowthEtaPrecise(town))}</span><span>${esc(growth.rate)}</span></div>` : ""}${town.isFed === false && input.foodFixLabel ? foodFixButtonHtml(input.foodFixLabel, "v2t-food-fix") : ""}</div>
    <div class="v2t-stats">${stats.map((s) => `<div class="v2t-stat"><span class="v2t-stat-k">${s.k}</span><span class="v2t-stat-v${s.tone}">${s.v}</span>${s.n ? `<span class="v2t-stat-n">${s.n}</span>` : ""}</div>`).join("")}${input.plotsHtml ?? ""}</div>
    ${focusCard}
    <div class="v2t-h">Town bonuses</div>${biota.rowHtml}${modifiers}
    ${built ? `<div class="v2t-h">In this town</div><div class="v2t-built-list">${built}</div>` : ""}
    <div class="v2t-grow-wrap">${growHtml}</div>`;
};

/** What stands on the selected support tile: name, state, what it gives and its upkeep. */
const builtCardHtml = (facts: readonly TileFact[]): string =>
  facts.length === 0
    ? ""
    : `<div class="v2t-h">Built here</div><div class="v2t-structure">${facts.map((f) => `<div class="v2t-structure-row"><span class="v2t-structure-k">${esc(f.label)}</span><span class="v2t-structure-v${f.tone ? ` v2t-structure-${f.tone}` : ""}">${esc(f.value)}</span></div>`).join("")}</div>`;

const buildPanelHtml = (input: TownScreenInput): string => {
  const supportFocus = keyOf(input.focus) !== keyOf(input.town);
  const placeLabel = supportFocus ? `Build on (${input.focus.x}, ${input.focus.y})` : input.placedBefore ? "Place another" : "Place";
  const work = input.focusView.work ?? [];
  // The selected tile (a support tile, or the town itself, e.g. a Fort on the town) can already hold a
  // building; show what it is and does, including when it's dormant and giving nothing.
  const built = builtCardHtml(builtStructureFacts(input.focus, input.focus.ownerId === input.town.ownerId, Date.now(), input.dormantResourcesFor, input.refineryStatusOf));
  const workHtml = work.length > 0 ? townWorkHtml(work, keyOf(input.focus), input.focusQueuePosition ?? 0, input.focusWorkLocked ?? false) : "";
  // Work first: under the "Built here" heading it would read as part of the building.
  const lead = `${workHtml}${built}`;
  const list = buildListHtml({
    buildings: input.focusView.buildings,
    focusLabel: supportFocus ? `(${input.focus.x}, ${input.focus.y})` : input.townView.title,
    focusHighlighted: supportFocus,
    selection: input.buildSelection,
    category: input.category ?? defaultBuildCategory(input.focusView.buildings),
    emptyText: `Nothing to build ${supportFocus ? "on this tile" : "here"}`,
    targetKey: keyOf(input.focus),
    placeLabel,
    ...(work.length > 0 ? { title: "In progress" } : built ? { title: "On this tile" } : {}),
    ...(lead ? { leadHtml: lead } : {})
  });
  const place = buildPlaceHtml({
    buildings: input.focusView.buildings, selection: input.buildSelection, targetKey: keyOf(input.focus), placeLabel, docked: true, placed: input.placed,
    autoImprove: autoImproveOptionForTile(input.autoSettle, input.focus)
  });
  return `${list}${place}`;
};

const barHtml = (input: TownScreenInput): string => {
  const btn = (a: TileActionDef | undefined, label: string): string =>
    a
      ? `<button type="button" class="v2t-act" data-hud-v2-action="${esc(a.id)}"${targetAttrs(a, keyOf(input.town))}${a.disabled ? " disabled" : ""} title="${esc(a.disabled ? a.disabledReason ?? "" : a.detail ?? "")}">${label}${a.cost ? `<small>${esc(a.cost)}</small>` : ""}</button>`
      : "";
  // Everything else the town tile offers, as small text buttons (no hidden ⋯ menu). Muster actions belong
  // to the tile they act on: the selected support tile's come from the focus. While a support tile is
  // selected every town-tile action is marked "(town)", so "Remove Fort" can't read as the selected tile's.
  const supportFocus = keyOf(input.focus) !== keyOf(input.town);
  const isMuster = (a: TileActionDef): boolean => a.id.startsWith("muster_");
  // The selected building's on/off switch (e.g. to free FOOD slots) acts on that tile, like muster actions.
  const isFocusOwned = (a: TileActionDef): boolean => isMuster(a) || STRUCTURE_TOGGLE_ACTION_IDS.has(a.id);
  // An ungarrisoned town's Garrison leads the bar as the gold main button; a text link was easy to miss.
  // With a support tile selected (the screen only opens on one once its town is garrisoned), that tile's
  // Garrison takes the slot instead. Touch has no tooltips, so a disabled one says why on the button.
  const townGarrison = input.townView.actions.find(isGarrison);
  const focusGarrison = supportFocus && !townGarrison ? input.focusView.actions.find(isGarrison) : undefined;
  const garrison = townGarrison ?? focusGarrison;
  const garrisonKey = focusGarrison ? keyOf(input.focus) : keyOf(input.town);
  // Plain "Garrison": the selected tile is already highlighted, and a longer label crushes on narrow phones.
  const garrisonLabel = garrison?.label ?? "";
  const garrisonNote = garrison?.disabled ? garrison.disabledReason : garrison?.cost;
  const garrisonBtn = garrison
    ? `<button type="button" class="v2t-act v2t-act-primary" data-hud-v2-action="settle_land"${targetAttrs(garrison, garrisonKey)}${garrison.disabled ? " disabled" : ""} title="${esc(garrison.disabled ? garrison.disabledReason ?? garrisonLabel : garrison.detail ?? garrisonLabel)}">${esc(garrisonLabel)}${garrisonNote ? `<small>${esc(garrisonNote)}</small>` : ""}</button>`
    : "";
  const improvement = garrison ? undefined : availableResourceImprovement(input.focusView);
  const improvementBtn = improvement
    ? `<button type="button" class="v2t-act v2t-act-primary" data-hud-v2-action="${esc(improvement.id)}"${targetAttrs(improvement, keyOf(input.focus))} title="${esc(improvement.detail ?? improvement.label)}">${esc(improvement.label)}${improvement.cost ? `<small>${esc(improvement.cost)}</small>` : ""}</button>`
    : "";
  // A garrisoned town with plots still to garrison: one gold button garrisons them all (the selected tile's own action wins the slot).
  const plots = garrison || improvement ? undefined : input.plotGarrison;
  const plotsBtn = plots
    ? `<button type="button" class="v2t-act v2t-act-primary" data-v2-garrison-plots="${esc(keyOf(input.town))}"${plots.disabledReason ? " disabled" : ""} title="${esc(plots.disabledReason ?? `Garrison ${plots.count} plot${plots.count === 1 ? "" : "s"} around the town`)}">Garrison plots<small>${esc(plots.disabledReason ?? plots.cost)}</small></button>`
    : "";
  // The "garrison these automatically from now on" checkbox the tile dock shows under its Garrison button.
  // Read from live prefs (a toggle doesn't rebuild focusView, so the snapshot's copy goes stale).
  const garrisonTile = focusGarrison ? input.focus : input.town;
  const option = garrison ? autoSettleOptionForTile({ autoSettle: input.autoSettle ?? { status: "unloaded" } }, garrisonTile) : undefined;
  const garrisonOption = option ? autoSettleOptionHtml({ ...option, label: "Garrison these automatically" }) : "";
  const shownIds = new Set<TileActionDef["id"]>(["muster_hold", "city_overclock", ...GROW_IDS, ...(garrison ? ["settle_land" as const] : []), "garrison_town_plots", ...(improvement ? [improvement.id] : [])]);
  // An action that is also in that tile's Build list stays there only: injected copies (the guide's
  // Manufactory, the checklist's Relay Beacon) duplicated it in this bar (owner report 2026-11-28).
  const notInBuild = (view: TileMenuView) => (a: TileActionDef): boolean => !view.buildings.some((b) => b.id === a.id);
  const minorActions = [
    ...input.townView.actions.filter((a) => !shownIds.has(a.id) && notInBuild(input.townView)(a)).map((a) => ({ a: supportFocus ? { ...a, label: `${a.label} (town)` } : a, key: keyOf(input.town) })),
    ...(supportFocus ? input.focusView.actions.filter((a) => !shownIds.has(a.id) && isFocusOwned(a) && notInBuild(input.focusView)(a)).map((a) => ({ a, key: keyOf(input.focus) })) : [])
  ];
  const minor = minorActions.map(({ a, key }) => minorActionButtonHtml(a, targetAttrs(a, key), a.cost ?? a.detail ?? "")).join("");
  // Raise flag on the selected tile; when it can't take one, on the town as before.
  const focusRaise = actionFor(input.focusView, "muster_hold");
  const raise = focusRaise ?? actionFor(input.townView, "muster_hold");
  const raiseOn = focusRaise ? input.focus : input.town;
  const raiseLabel = !supportFocus ? "Raise flag" : focusRaise ? `Raise flag on (${input.focus.x}, ${input.focus.y})` : "Raise flag on town";
  const raiseBtn = raise
    ? `<button type="button" class="v2t-act" data-hud-v2-action="muster_hold" data-target-key="${esc(keyOf(raiseOn))}"${raise.disabled ? " disabled" : ""} title="${esc(raise.disabled ? raise.disabledReason ?? "" : raise.detail ?? "")}">${raiseLabel}</button>`
    : "";
  return `${garrisonBtn}${improvementBtn}${plotsBtn}${raiseBtn}${btn(actionFor(input.townView, "city_overclock"), "Overclock")}
    ${minor ? `<span class="v2t-minor">${minor}</span>` : ""}
    <button type="button" class="v2t-act v2t-act-back" data-v2-close>◁ Map<span class="v2-key-hint"> · Esc</span></button>${garrisonOption}`;
};

export const townScreenRegions = (input: TownScreenInput): { left: string; build: string; bar: string } => ({
  left: leftPanelHtml(input),
  build: buildPanelHtml(input),
  bar: barHtml(input)
});

export const TOWN_SCREEN_SKELETON = `<section class="v2t-left" id="v2t-left" aria-label="Town"></section>
  <section class="v2t-right" id="v2t-build" aria-label="Build"></section>
  <div class="v2t-bar" id="v2t-bar"></div>
  <div class="v2t-pick" id="v2t-pick" aria-label="Place building"></div>`;
