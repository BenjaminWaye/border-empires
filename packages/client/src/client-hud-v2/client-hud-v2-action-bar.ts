// Bottom-centre tile panel + action bar for the new HUD. It is built from the
// same TileMenuView the floating tile menu uses, so every action keeps its
// existing handler: one main action, up to two others, then Build / Aether /
// ⋯ which open the full legacy menu on the matching tab.

import { autoSettleOptionHtml } from "../client-auto-settle-prompt/client-auto-settle-tile-option.js";
import type { TileActionDef, TileMenuTab, TileMenuView } from "../client-types.js";

export type BarButton =
  | { kind: "action"; action: TileActionDef; primary: boolean }
  | { kind: "tab"; tab: TileMenuTab; label: string; tone: "build" | "aether" | "more" };

const PRIMARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  "launch_attack",
  "march_attack_flag",
  "collect_shard",
  "expand_here"
];

const SECONDARY_ORDER: ReadonlyArray<TileActionDef["id"]> = [
  "settle_land",
  "settle_many",
  "muster_hold",
  "muster_advance",
  "muster_march",
  "diplomacy",
  "city_overclock"
];

const MAX_SECONDARY = 2;

/**
 * settle_land is both "Expand To" on neutral land (client-tile-action-neutral.ts) and "Garrison" on your
 * frontier (client-tile-action-settle-visibility.ts); only the label tells them apart in the view.
 */
const isGarrison = (a: TileActionDef): boolean => a.id === "settle_land" && a.label.startsWith("Garrison");

/** Garrison is the main action only where the tile is worth it (flagged recommended: resources, towns, docks). */
const primaryAction = (actions: readonly TileActionDef[]): TileActionDef | undefined => {
  for (const id of PRIMARY_ORDER) {
    const hit = actions.find((a) => a.id === id && !a.disabled);
    if (hit) return hit;
  }
  return actions.find((a) => a.id === "settle_land" && !a.disabled && (!isGarrison(a) || a.recommended));
};

export const selectBarButtons = (view: Pick<TileMenuView, "actions" | "buildings" | "crystal" | "tabs">): BarButton[] => {
  const buttons: BarButton[] = [];
  const primary = primaryAction(view.actions);
  if (primary) buttons.push({ kind: "action", action: primary, primary: true });
  let secondary = 0;
  for (const id of SECONDARY_ORDER) {
    if (secondary >= MAX_SECONDARY) break;
    const hit = view.actions.find((a) => a.id === id && a !== primary);
    if (!hit) continue;
    buttons.push({ kind: "action", action: hit, primary: false });
    secondary += 1;
  }
  if (view.buildings.length > 0 && view.tabs.includes("buildings")) buttons.push({ kind: "tab", tab: "buildings", label: "Build ▸", tone: "build" });
  if (view.crystal.length > 0 && view.tabs.includes("crystal")) buttons.push({ kind: "tab", tab: "crystal", label: "Aether ▾", tone: "aether" });
  const shownIds = new Set(buttons.flatMap((b) => (b.kind === "action" ? [b.action.id] : [])));
  const remaining = view.actions.some((a) => !shownIds.has(a.id)) || view.tabs.some((t) => t !== "actions" && t !== "buildings" && t !== "crystal");
  if (remaining) buttons.push({ kind: "tab", tab: view.tabs.includes("actions") ? "actions" : (view.tabs[0] ?? "overview"), label: "⋯", tone: "more" });
  return buttons;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const actionButtonHtml = (b: Extract<BarButton, { kind: "action" }>): string => {
  const a = b.action;
  const cls = `hud-v2-act${b.primary ? " hud-v2-act-primary" : ""}${a.disabled ? " hud-v2-act-disabled" : ""}`;
  const title = a.disabled ? a.disabledReason ?? a.label : a.detail ?? a.label;
  const targets = `${a.targetKey ? ` data-target-key="${esc(a.targetKey)}"` : ""}${a.originKey ? ` data-origin-key="${esc(a.originKey)}"` : ""}`;
  return `<button type="button" class="${cls}" data-hud-v2-action="${esc(a.id)}"${targets}${a.disabled ? " disabled" : ""} title="${esc(title)}"><span class="hud-v2-act-label">${esc(a.label)}</span>${a.cost ? `<span class="hud-v2-act-cost">${esc(a.cost)}</span>` : ""}</button>`;
};

export const actionBarHtml = (view: TileMenuView): string => {
  const buttons = selectBarButtons(view);
  const status = view.statusText ? `<span class="hud-v2-tile-status hud-v2-tile-status-${view.statusTone ?? "neutral"}">${esc(view.statusText)}</span>` : "";
  const head = `<div class="hud-v2-tile-head"><span class="hud-v2-tile-text"><span class="hud-v2-tile-title">${esc(view.title)}</span><span class="hud-v2-tile-sub">${view.subtitleHtml ?? esc(view.subtitle)}</span></span>${status}<button type="button" class="hud-v2-tile-close" data-hud-v2-close aria-label="Close">✕</button></div>`;
  const row = buttons.map((b) => (b.kind === "action"
    ? actionButtonHtml(b)
    : `<button type="button" class="hud-v2-act hud-v2-act-${b.tone}" data-hud-v2-tab="${b.tab}"${b.tone === "more" ? ' aria-label="More actions"' : ""}>${esc(b.label)}</button>`)).join("");
  const autoSettle = buttons.flatMap((b) => (b.kind === "action" && b.action.autoSettleOption ? [b.action.autoSettleOption] : []))[0];
  return `${head}${row ? `<div class="hud-v2-act-row">${row}</div>` : ""}${autoSettle ? autoSettleOptionHtml(autoSettle) : ""}`;
};
