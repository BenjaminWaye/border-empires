// Bottom-centre tile panel + action bar for the new HUD. It is built from the
// same TileMenuView the floating tile menu uses, so every action keeps its
// existing handler. Size carries the hierarchy and nothing is hidden: one main
// action, up to two others, Build ▸ and Aether ▸ (right-hand sidebars) and
// Details ▾ (the full tile overview), then every remaining action as a row of
// smaller text buttons underneath. A fact strip above says what the tile is.

import { buildingActionCategory } from "../client-tile-menu-building-category/client-tile-menu-building-category.js";
import { autoSettleOptionHtml } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import { isFrontierRelayBeacon } from "../client-tile-action-support/client-tile-action-support.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { plainText, type TileFact } from "./client-hud-v2-tile-facts.js";
import { tileProgressHtml } from "./client-hud-v2-tile-progress.js";
import { minorActionButtonHtml } from "./client-hud-v2-minor-button.js";
import { detailLinesBeyondFacts } from "./client-hud-v2-tile-details.js";
import { TILE_VIEW_PANELS, TILE_VIEW_TITLE, type TileViewPanel } from "./client-hud-v2-tile-views.js";

export type BarPanel = "aether" | "build" | "details" | "progress" | "status" | TileViewPanel;

export type BarButton =
  | { kind: "action"; action: TileActionDef; primary: boolean }
  | { kind: "afc"; primary: boolean }
  | { kind: "panel"; panel: BarPanel; label: string; primary?: boolean };

type BarView = Pick<TileMenuView, "actions" | "buildings" | "crystal" | "tabs"> & Partial<Pick<TileMenuView, "overviewLines" | "afcUpgradesReady" | "progress" | "modules">>;

const PRIMARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  // Your own tile while Planetary Defense is capturing it: send a flag after them.
  "muster_hunt_attackers",
  "launch_attack",
  "march_attack_flag",
  "expand_here",
  "march_to_pick_origin",
  // An unexplored tile: launch the scout drone (client-scout-drone/), or call it back while it flies out.
  "explore_scout",
  "recall_scout",
  // Your own AFC with nothing to upgrade or call down: send the scout drone (or call it back).
  "afc_scout_drone",
  // Your own dock, when a lane leads to new ground: go to the far dock (client-dock-navigator.ts).
  "dock_cross_sea",
  // Only offered on your own Reclamation Works; gold while there is salvage to ship.
  "ship_salvage_to_court",
  "activate_waystation"
];

const RELAY_BEACON_IDS: ReadonlyArray<TileActionDef["id"]> = ["build_relay_beacon", "build_relay_beacon_frontier"];

/** Raise flag comes first among the others; Garrison is never here (it lives in ⋯ unless it is the main action). */
const SECONDARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  "muster_hold",
  "muster_advance",
  "muster_march",
  "muster_hunt",
  "diplomacy",
  "city_overclock",
  // Outside your reach: a beacon on your land toward this tile (client-relay-beacon-toward.ts).
  "relay_beacon_toward"
];

const MAX_SECONDARY = 2;


/**
 * settle_land is both "Expand To" on neutral land (client-tile-action-neutral.ts) and "Garrison" on your
 * frontier (client-tile-action-settle-visibility.ts); only the label tells them apart in the view.
 */
export const isGarrison = (a: TileActionDef): boolean => a.id === "settle_land" && a.label.startsWith("Garrison");

const relayBeacon = (view: BarView): TileActionDef | undefined =>
  [...view.actions, ...view.buildings].find((a) => RELAY_BEACON_IDS.includes(a.id) && !a.disabled);

export const availableResourceImprovement = (view: Pick<BarView, "actions" | "buildings">): TileActionDef | undefined =>
  [...view.actions, ...view.buildings].find((a) => buildingActionCategory(a) === "resource" && !a.disabled);

/**
 * Attack-type actions first, then a Garrison worth it (recommended: resources, towns, docks),
 * then an available resource improvement, Relay Beacon, then Expand To.
 * On plain frontier the beacon leads and Garrison sits in the minor row.
 */
const primaryAction = (view: BarView): TileActionDef | undefined => {
  for (const id of PRIMARY_ORDER) {
    const hit = view.actions.find((a) => a.id === id && !a.disabled);
    if (hit) return hit;
  }
  // The active waypoint's target (incl. a plain Expand click, which queues one): Cancel is gold
  // unless an attack/march above applies, ahead of the fallback suggestions below.
  return view.actions.find((a) => a.id === "cancel_waypoint")
    ?? view.actions.find((a) => isGarrison(a) && a.recommended && !a.disabled)
    ?? availableResourceImprovement(view)
    ?? relayBeacon(view)
    ?? view.actions.find((a) => a.id === "settle_land" && !a.disabled && !isGarrison(a))
    ?? blockedPrimaryAction(view);
};

/** Expanding onto a tile: neutral land's beacon, or a beacon that garrisons your frontier tile first. */
const isExpandingBeacon = (a: TileActionDef): boolean => a.id === "build_relay_beacon_frontier" || isFrontierRelayBeacon(a);

/**
 * With no Garrison or Expand To the player can do, the tile's main action stays on the bar greyed with its
 * reason, instead of moving to the minor row or the Build list where players couldn't find it. Interior
 * settled tiles also offer a beacon; a blocked one there is not their main action, so it isn't kept.
 * An unexplored tile's Explore, greyed while the drone is out, likewise keeps its "back in …" reason on
 * the bar: in the minor row the reason was only a tooltip, which a phone never shows (2026-11-14 playtest).
 */
const blockedPrimaryAction = (view: BarView): TileActionDef | undefined => {
  if (view.actions.some((a) => a.id === "settle_land" && !a.disabled)) return undefined;
  return view.actions.find((a) => isGarrison(a) && a.recommended)
    ?? view.actions.find((a) => a.id === "explore_scout")
    ?? view.actions.find((a) => (a.id === "settle_land" && !isGarrison(a)) || a.id === "expand_here")
    ?? [...view.actions, ...view.buildings].find(isExpandingBeacon);
};

/** afcUpgradesReady is only set when the selected tile is the viewer's own AFC (client-hud-v2-tile-dock.ts). */
const isOwnAfc = (view: Pick<BarView, "afcUpgradesReady">): boolean => view.afcUpgradesReady !== undefined;

/** A module this AFC can call down right now (an enabled Call down row; full AFCs show only disabled ones). */
const hasModuleToCallDown = (view: Pick<BarView, "modules">): boolean => view.modules?.actions.some((a) => !a.disabled) ?? false;

/** The scout drone's AFC rows: the main action only when the AFC has nothing to upgrade or call down. */
const SCOUT_AFC_IDS: ReadonlyArray<TileActionDef["id"]> = ["afc_scout_drone", "recall_scout"];

export const selectBarButtons = (view: BarView): BarButton[] => {
  const buttons: BarButton[] = [];
  const afcReady = (view.afcUpgradesReady ?? 0) > 0;
  const candidate = afcReady ? undefined : primaryAction(view);
  // A module to call down outranks only the scout drone; an urgent action (e.g. hunting attackers) keeps gold.
  const modulesReady = !afcReady && isOwnAfc(view) && hasModuleToCallDown(view) && (!candidate || SCOUT_AFC_IDS.includes(candidate.id));
  const primary = modulesReady ? undefined : candidate;
  // On your own AFC, a ready AFC upgrade leads in gold, then a module to call down; with neither,
  // Send scout drone does (PRIMARY_ORDER), unless an urgent action (e.g. hunting attackers) applies.
  // AFC upgrades and Modules always stay on the bar instead of hiding in the minor row under Build ▸.
  const modules: BarButton | undefined = isOwnAfc(view) && view.tabs.includes("modules") ? { kind: "panel", panel: "modules", label: "Modules ▸", primary: modulesReady } : undefined;
  if (modulesReady && modules) buttons.push(modules);
  if (afcReady || (isOwnAfc(view) && !primary && !modulesReady)) buttons.push({ kind: "afc", primary: true });
  if (primary) buttons.push({ kind: "action", action: primary, primary: true });
  if (isOwnAfc(view) && (primary || modulesReady)) buttons.push({ kind: "afc", primary: false });
  if (!modulesReady && modules) buttons.push(modules);
  let secondary = 0;
  for (const id of SECONDARY_ORDER) {
    if (secondary >= MAX_SECONDARY) break;
    const hit = view.actions.find((a) => a.id === id && a !== primary);
    if (!hit) continue;
    buttons.push({ kind: "action", action: hit, primary: false });
    secondary += 1;
  }
  if (barBuildings(view, primary).length > 0) buttons.push({ kind: "panel", panel: "build", label: "Build ▸" });
  if (view.crystal.length > 0) buttons.push({ kind: "panel", panel: "aether", label: "Aether ▸" });
  if (hasDetails(view)) buttons.push({ kind: "panel", panel: "details", label: "Details ▾" });
  return buttons;
};

/** Details ▾ appears when the overview has more than a loading row to show. */
export const hasDetails = (view: Partial<Pick<TileMenuView, "overviewLines">>): boolean =>
  (view.overviewLines ?? []).some((l) => l.kind !== "loading" && plainText(l.html) !== "");

/** Resource improvements remain discoverable in Build even when also the main action. */
export const barBuildings = (view: Pick<TileMenuView, "buildings">, primary: TileActionDef | undefined): TileActionDef[] =>
  view.buildings.filter((b) => b !== primary || buildingActionCategory(b) === "resource");

/** Every action the main row doesn't show (Garrison, Garrison many, Abandon, …): drawn as the minor row. */
export const moreActions = (view: Pick<TileMenuView, "actions">, buttons: readonly BarButton[]): TileActionDef[] => {
  const shown = new Set(buttons.flatMap((b) => (b.kind === "action" ? [b.action] : [])));
  return view.actions.filter((a) => !shown.has(a));
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const targets = (a: TileActionDef): string =>
  `${a.targetKey ? ` data-target-key="${esc(a.targetKey)}"` : ""}${a.originKey ? ` data-origin-key="${esc(a.originKey)}"` : ""}`;

const actionButtonHtml = (b: Extract<BarButton, { kind: "action" }>): string => {
  const a = b.action;
  const cls = `hud-v2-act${b.primary ? " hud-v2-act-primary" : ""}${a.disabled ? " hud-v2-act-disabled" : ""}`;
  const title = a.disabled ? a.disabledReason ?? a.label : a.detail ?? a.label;
  // Touch has no tooltips, so a disabled button says why where its cost would be.
  const note = a.disabled ? a.disabledReason ?? a.cost : a.cost;
  return `<button type="button" class="${cls}" data-hud-v2-action="${esc(a.id)}"${targets(a)}${a.disabled ? " disabled" : ""} title="${esc(title)}"><span class="hud-v2-act-label">${esc(a.label)}</span>${note ? `<span class="hud-v2-act-cost">${esc(note)}</span>` : ""}</button>`;
};

/** The minor row: small text buttons for everything else, plus links to the sidebar tile views (modules, commitment, reports). */
const minorRowHtml = (view: TileMenuView, buttons: readonly BarButton[], panel?: BarPanel): string => {
  const minor = moreActions(view, buttons).map((a) => minorActionButtonHtml(a, targets(a), [a.cost, a.detail].filter(Boolean).join(" · ")));
  if (view.afcUpgradesReady === 0 && !buttons.some((b) => b.kind === "afc")) minor.push(`<button type="button" class="hud-v2-minor hud-v2-minor-link" data-hud-v2-open="afc">AFC upgrades ▸</button>`);
  if (view.progress) minor.push(`<button type="button" class="hud-v2-minor hud-v2-minor-link" data-hud-v2-panel="progress" aria-expanded="${panel === "progress"}">Progress ${panel === "progress" ? "▾" : "▸"}</button>`);
  // One link per sidebar view, each named for what it opens: a muster flag carries both Attack commitment
  // and Combat reports, and a single link labelled "Reports" used to open the commitment tab (2026-11-16 playtest).
  for (const tab of TILE_VIEW_PANELS) {
    if (!view.tabs.includes(tab) || buttons.some((b) => b.kind === "panel" && b.panel === tab)) continue;
    minor.push(`<button type="button" class="hud-v2-minor hud-v2-minor-link" data-hud-v2-panel="${tab}" aria-expanded="${panel === tab}">${TILE_VIEW_TITLE[tab]} ▸</button>`);
  }
  return minor.length > 0 ? `<div class="hud-v2-minor-row">${minor.join("")}</div>` : "";
};

// Overview lines are trusted HTML the menu builds itself (the legacy panel renders them the same way).
// Research and structure links are handled by the dock; other legacy-only buttons become plain text here.
const detailLineHtml = (line: TileMenuView["overviewLines"][number]): string => {
  const kind = line.kind ? ` hud-v2-detail-${line.kind}` : "";
  const html = line.html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g,
    (button: string, attributes: string, label: string) => /\bdata-(?:view-tech|structure-info)=/.test(attributes) ? button : label);
  return `<div class="hud-v2-detail-line tile-overview-line${line.kind ? ` tile-overview-line-${line.kind}` : ""}${line.nested ? " tile-overview-line-nested" : ""}${kind}">${html}</div>`;
};

const detailsHtml = (view: TileMenuView): string =>
  `<div class="hud-v2-pop hud-v2-details" role="region" aria-label="Tile details">${view.overviewLines.filter((l) => l.kind !== "loading").map(detailLineHtml).join("")}</div>`;

const factsHtml = (facts: readonly TileFact[]): string =>
  facts.length > 0
    ? `<div class="hud-v2-tile-facts">${facts.map((f) => `<span class="hud-v2-fact${f.tone ? ` hud-v2-fact-${f.tone}` : ""}"><span class="hud-v2-fact-label">${esc(f.label)}</span>${esc(f.value)}</span>`).join("")}</div>`
    : "";

/** The status explainer on its own: tapping the status chip shows only this, not the whole Details list. */
const statusHelpHtml = (view: Pick<TileMenuView, "statusText" | "statusHelpText">): string =>
  `<div class="hud-v2-pop hud-v2-details hud-v2-status-help" role="region" aria-label="Status"><div class="hud-v2-detail-line tile-overview-line"><strong>${esc(plainText(view.statusText ?? ""))}:</strong> ${esc(view.statusHelpText ?? "")}</div></div>`;

/** ownerTagHtml: trusted markup shown before the owner's name (the stance tag). */
export const actionBarHtml = (fullView: TileMenuView, panel?: BarPanel, facts: readonly TileFact[] = [], ownerTagHtml = ""): string => {
  // Details never repeats the fact strip; with nothing else to say it has no button.
  // A status with an explainer ("Beyond your reach") opens just that explainer: it used to open the whole
  // Details list, so tapping "Inside X Reach" also showed unrelated tile modifiers (2026-11-16 playtest).
  const hasHelp = Boolean(fullView.statusText && fullView.statusHelpText);
  const view = { ...fullView, overviewLines: detailLinesBeyondFacts(fullView.overviewLines, facts) };
  const buttons = selectBarButtons(view);
  const statusCls = `hud-v2-tile-status hud-v2-tile-status-${view.statusTone ?? "neutral"}`;
  const status = !view.statusText ? ""
    : hasHelp
      ? `<button type="button" class="${statusCls} hud-v2-tile-status-help" data-hud-v2-panel="status" aria-expanded="${panel === "status"}" title="What does this mean?">${esc(view.statusText)} ⓘ</button>`
      : `<span class="${statusCls}">${esc(view.statusText)}</span>`;
  const head = `<div class="hud-v2-tile-head"><span class="hud-v2-tile-text"><span class="hud-v2-tile-title">${esc(view.title)}</span><span class="hud-v2-tile-sub">${ownerTagHtml}${view.subtitleHtml ?? esc(view.subtitle)}</span></span>${status}<button type="button" class="hud-v2-tile-close" data-hud-v2-close aria-label="Close">✕</button></div>`;
  const row = buttons.map((b) => (b.kind === "action"
    ? actionButtonHtml(b)
    : b.kind === "afc" ? `<button type="button" class="hud-v2-act${b.primary ? " hud-v2-act-primary" : ""}" data-hud-v2-open="afc">${(view.afcUpgradesReady ?? 0) > 0 ? `AFC upgrades · ${view.afcUpgradesReady} ready` : "AFC upgrades"}</button>`
    : `<button type="button" class="hud-v2-act${b.primary ? " hud-v2-act-primary" : ""} hud-v2-act-${b.panel}${b.panel === panel ? " hud-v2-act-open" : ""}" data-hud-v2-panel="${b.panel}" aria-expanded="${b.panel === panel}">${esc(b.label)}</button>`)).join("");
  const primary = buttons.find((b): b is Extract<BarButton, { kind: "action" }> => b.kind === "action" && b.primary);
  const autoSettle = primary?.action.autoSettleOption;
  // A Garrison checkbox belongs with whichever Garrison button is showing (main or minor row).
  const garrisonOption = autoSettle ?? moreActions(view, buttons).find((a) => a.autoSettleOption)?.autoSettleOption;
  return `${head}${factsHtml(facts)}${panel === "details" ? detailsHtml(view) : panel === "status" && hasHelp ? statusHelpHtml(view) : panel === "progress" ? tileProgressHtml(view.progress) : ""}${row ? `<div class="hud-v2-act-row">${row}</div>` : ""}${minorRowHtml(view, buttons, panel)}${garrisonOption ? autoSettleOptionHtml(garrisonOption) : ""}`;
};
