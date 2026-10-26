// Bottom-centre tile panel + action bar for the new HUD. It is built from the
// same TileMenuView the floating tile menu uses, so every action keeps its
// existing handler. Size carries the hierarchy and nothing is hidden: one main
// action, up to two others, Build ▸ (a build sidebar), Aether ▾ (a list) and
// Details ▾ (the full tile overview), then every remaining action as a row of
// smaller text buttons underneath. A fact strip above says what the tile is.

import { autoSettleOptionHtml } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { plainText, type TileFact } from "./client-hud-v2-tile-facts.js";

export type BarPanel = "aether" | "build" | "details";

export type BarButton =
  | { kind: "action"; action: TileActionDef; primary: boolean }
  | { kind: "panel"; panel: BarPanel; label: string };

type BarView = Pick<TileMenuView, "actions" | "buildings" | "crystal" | "tabs"> & Partial<Pick<TileMenuView, "overviewLines">>;

const PRIMARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  "launch_attack",
  "march_attack_flag",
  "collect_shard",
  "expand_here"
];

const RELAY_BEACON_IDS: ReadonlyArray<TileActionDef["id"]> = ["build_relay_beacon", "build_relay_beacon_frontier"];

/** Raise flag comes first among the others; Garrison is never here (it lives in ⋯ unless it is the main action). */
const SECONDARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  "muster_hold",
  "muster_advance",
  "muster_march",
  "diplomacy",
  "city_overclock"
];

const MAX_SECONDARY = 2;

/** Legacy tabs with no new-style view yet (AFC modules, muster commit/reports, progress) stay reachable from ⋯. */
const LEGACY_ONLY_TABS: ReadonlyArray<TileMenuView["tabs"][number]> = ["modules", "commit", "reports", "progress"];

/**
 * settle_land is both "Expand To" on neutral land (client-tile-action-neutral.ts) and "Garrison" on your
 * frontier (client-tile-action-settle-visibility.ts); only the label tells them apart in the view.
 */
const isGarrison = (a: TileActionDef): boolean => a.id === "settle_land" && a.label.startsWith("Garrison");

const relayBeacon = (view: BarView): TileActionDef | undefined =>
  [...view.actions, ...view.buildings].find((a) => RELAY_BEACON_IDS.includes(a.id) && !a.disabled);

/** Attack-type actions first, then a Relay Beacon, then Expand To or a Garrison worth it (recommended: resources, towns, docks). */
const primaryAction = (view: BarView): TileActionDef | undefined => {
  for (const id of PRIMARY_ORDER) {
    const hit = view.actions.find((a) => a.id === id && !a.disabled);
    if (hit) return hit;
  }
  return relayBeacon(view) ?? view.actions.find((a) => a.id === "settle_land" && !a.disabled && (!isGarrison(a) || a.recommended));
};

export const selectBarButtons = (view: BarView): BarButton[] => {
  const buttons: BarButton[] = [];
  const primary = primaryAction(view);
  if (primary) buttons.push({ kind: "action", action: primary, primary: true });
  let secondary = 0;
  for (const id of SECONDARY_ORDER) {
    if (secondary >= MAX_SECONDARY) break;
    const hit = view.actions.find((a) => a.id === id && a !== primary);
    if (!hit) continue;
    buttons.push({ kind: "action", action: hit, primary: false });
    secondary += 1;
  }
  if (barBuildings(view, primary).length > 0) buttons.push({ kind: "panel", panel: "build", label: "Build ▸" });
  if (view.crystal.length > 0) buttons.push({ kind: "panel", panel: "aether", label: "Aether ▾" });
  if (hasDetails(view)) buttons.push({ kind: "panel", panel: "details", label: "Details ▾" });
  return buttons;
};

/** Details ▾ appears when the overview has more than a loading row to show. */
export const hasDetails = (view: Partial<Pick<TileMenuView, "overviewLines">>): boolean =>
  (view.overviewLines ?? []).some((l) => l.kind !== "loading" && plainText(l.html) !== "");

/** The build list, without a Relay Beacon already on the bar as the main action. */
export const barBuildings = (view: Pick<TileMenuView, "buildings">, primary: TileActionDef | undefined): TileActionDef[] =>
  view.buildings.filter((b) => b !== primary);

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
  return `<button type="button" class="${cls}" data-hud-v2-action="${esc(a.id)}"${targets(a)}${a.disabled ? " disabled" : ""} title="${esc(title)}"><span class="hud-v2-act-label">${esc(a.label)}</span>${a.cost ? `<span class="hud-v2-act-cost">${esc(a.cost)}</span>` : ""}</button>`;
};

/** One row of the ⋯ / Aether lists: label, then cost or why it's unavailable. */
const listRowHtml = (a: TileActionDef): string => {
  const note = a.disabled ? a.disabledReason ?? "" : a.cost ?? a.detail ?? "";
  const option = a.autoSettleOption ? autoSettleOptionHtml(a.autoSettleOption) : "";
  return `<div class="hud-v2-pop-item"><button type="button" class="hud-v2-pop-row${a.disabled ? " hud-v2-pop-row-off" : ""}" data-hud-v2-action="${esc(a.id)}"${targets(a)}${a.disabled ? " disabled" : ""}>
      <span class="hud-v2-pop-label">${esc(a.label)}</span>${note ? `<span class="hud-v2-pop-note">${esc(note)}</span>` : ""}
    </button>${option}</div>`;
};

const aetherListHtml = (view: TileMenuView): string =>
  `<div class="hud-v2-pop" role="menu" aria-label="Aether abilities"><div class="hud-v2-pop-h">Aether</div>${view.crystal.map(listRowHtml).join("")}</div>`;

/** The minor row: small text buttons for everything else, plus a link to legacy-only views (progress, modules, reports). */
const minorRowHtml = (view: TileMenuView, buttons: readonly BarButton[]): string => {
  const minor = moreActions(view, buttons).map((a) => {
    const title = a.disabled ? a.disabledReason ?? a.label : [a.cost, a.detail].filter(Boolean).join(" · ") || a.label;
    return `<button type="button" class="hud-v2-minor${a.disabled ? " hud-v2-minor-off" : ""}" data-hud-v2-action="${esc(a.id)}"${targets(a)}${a.disabled ? " disabled" : ""} title="${esc(title)}">${esc(a.label)}</button>`;
  });
  const legacyTab = view.tabs.find((t) => LEGACY_ONLY_TABS.includes(t));
  if (legacyTab) minor.push(`<button type="button" class="hud-v2-minor hud-v2-minor-link" data-hud-v2-tab="${legacyTab}">${legacyTab === "progress" ? "Progress" : legacyTab === "modules" ? "Modules" : "Reports"} ▸</button>`);
  return minor.length > 0 ? `<div class="hud-v2-minor-row">${minor.join("")}</div>` : "";
};

// Overview lines are trusted HTML the menu builds itself (the legacy panel renders them the same way). Their
// structure-info buttons are wired to the legacy panel only, so they become plain text here.
const detailLineHtml = (line: TileMenuView["overviewLines"][number]): string => {
  const kind = line.kind ? ` hud-v2-detail-${line.kind}` : "";
  const html = line.html.replace(/<button\b[^>]*>([\s\S]*?)<\/button>/g, "$1");
  return `<div class="hud-v2-detail-line tile-overview-line${line.kind ? ` tile-overview-line-${line.kind}` : ""}${line.nested ? " tile-overview-line-nested" : ""}${kind}">${html}</div>`;
};

const detailsHtml = (view: TileMenuView): string =>
  `<div class="hud-v2-pop hud-v2-details" role="region" aria-label="Tile details">${view.overviewLines.filter((l) => l.kind !== "loading").map(detailLineHtml).join("")}</div>`;

const factsHtml = (facts: readonly TileFact[]): string =>
  facts.length > 0
    ? `<div class="hud-v2-tile-facts">${facts.map((f) => `<span class="hud-v2-fact${f.tone ? ` hud-v2-fact-${f.tone}` : ""}"><span class="hud-v2-fact-label">${esc(f.label)}</span>${esc(f.value)}</span>`).join("")}</div>`
    : "";

export const actionBarHtml = (view: TileMenuView, panel?: BarPanel, facts: readonly TileFact[] = []): string => {
  const buttons = selectBarButtons(view);
  const status = view.statusText ? `<span class="hud-v2-tile-status hud-v2-tile-status-${view.statusTone ?? "neutral"}">${esc(view.statusText)}</span>` : "";
  const head = `<div class="hud-v2-tile-head"><span class="hud-v2-tile-text"><span class="hud-v2-tile-title">${esc(view.title)}</span><span class="hud-v2-tile-sub">${view.subtitleHtml ?? esc(view.subtitle)}</span></span>${status}<button type="button" class="hud-v2-tile-close" data-hud-v2-close aria-label="Close">✕</button></div>`;
  const row = buttons.map((b) => (b.kind === "action"
    ? actionButtonHtml(b)
    : `<button type="button" class="hud-v2-act hud-v2-act-${b.panel}${b.panel === panel ? " hud-v2-act-open" : ""}" data-hud-v2-panel="${b.panel}" aria-expanded="${b.panel === panel}">${esc(b.label)}</button>`)).join("");
  const primary = buttons.find((b): b is Extract<BarButton, { kind: "action" }> => b.kind === "action" && b.primary);
  const autoSettle = primary?.action.autoSettleOption;
  // A Garrison checkbox belongs with whichever Garrison button is showing (main or minor row).
  const garrisonOption = autoSettle ?? moreActions(view, buttons).find((a) => a.autoSettleOption)?.autoSettleOption;
  return `${head}${factsHtml(facts)}${panel === "aether" ? aetherListHtml(view) : ""}${panel === "details" ? detailsHtml(view) : ""}${row ? `<div class="hud-v2-act-row">${row}</div>` : ""}${minorRowHtml(view, buttons)}${garrisonOption ? autoSettleOptionHtml(garrisonOption) : ""}`;
};
