import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-stat-chips-style.css";
import { MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { hudMarkup } from "@client/client-dom-markup/client-dom-markup.js";
import { rateToneClass } from "@client/client-app-runtime-utils.js";
import { devGearsChipHtml } from "@client/client-dev-gears/client-dev-gears.js";
import { selfPlayerChipHtml } from "@client/client-hud/client-stat-chips.js";
import { manpowerGaugeChipHtml } from "@client/client-manpower-gauge/client-manpower-gauge.js";
import { strategicRibbonHtml } from "@client/client-panel-html/client-panel-html.js";

/**
 * Shared fixture for the HUD stat-chip stories: renders the game's own chip
 * builders (client-manpower-gauge.ts, client-dev-gears.ts, client-stat-chips.ts,
 * the resource ribbon, the real panel buttons) inside the real #top-strip /
 * #stats-chips with style.css and the steampunk theme, so a story can't drift
 * from the shipped HUD. Chip markup order mirrors client-hud.ts.
 */
export type HudChipsArgs = {
  manpower: number;
  manpowerCap: number;
  staged: number;
  regenPerMinute: number;
  /** How far into the 4h refill window we are; drives the countdown. */
  minutesIntoWindow: number;
  devBusy: number;
  devLimit: number;
  /** Alert states: Integrity below 90%, every Development slot busy. */
  warnings: boolean;
};

export const DEFAULT_HUD_CHIPS_ARGS: HudChipsArgs = {
  manpower: 412,
  manpowerCap: 720,
  staged: 0,
  regenPerMinute: 0.4,
  minutesIntoWindow: 160,
  devBusy: 2,
  devLimit: 3,
  warnings: false
};

const NOW = 1_790_000_000_000;
const NO_ANIM = { until: 0, dir: 0 as const };
const RESOURCES = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 };

export const isMobileViewport = (): boolean => window.matchMedia("(max-width: 900px)").matches;

const formatAmount = (value: number): string => Math.round(value).toString();

export const manpowerChip = (args: HudChipsArgs): string =>
  manpowerGaugeChipHtml({
    manpower: args.manpower,
    manpowerCap: args.manpowerCap,
    staged: args.staged,
    regenPerMinute: args.regenPerMinute,
    logisticsPerMinute: 0,
    nextRefillAtMs: NOW + MANPOWER_REFILL_WINDOW_MS - args.minutesIntoWindow * 60_000,
    nowMs: NOW,
    formatAmount
  });

const ribbonHtml = (): string =>
  strategicRibbonHtml(
    RESOURCES,
    RESOURCES,
    { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
    { FOOD: NO_ANIM, TITANIUM: NO_ANIM, CRYSTAL: NO_ANIM, UMBRITE: NO_ANIM, SHARD: NO_ANIM },
    rateToneClass,
    { supply: { FOOD: 6, TITANIUM: 2, CRYSTAL: 1, UMBRITE: 1 }, demand: { FOOD: 4, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 1 } }
  );

const panelActionsHtml = (): string => {
  const doc = new DOMParser().parseFromString(`<div>${hudMarkup}</div>`, "text/html");
  return doc.getElementById("panel-actions")?.outerHTML ?? "";
};

export const topStripHtml = (args: HudChipsArgs, mobile: boolean): string => {
  const devBusy = args.warnings ? args.devLimit : Math.min(args.devBusy, args.devLimit);
  return `
  <div id="top-strip" style="position:relative;top:auto;left:auto;right:auto;">
    <div id="stats-chips">
      ${mobile ? "" : selfPlayerChipHtml("normal", "Aurelian", {})}
      <button class="stat-chip stat-chip-gold" type="button" data-economy-open="GOLD"><span>Coin</span><strong>1204.50 <em class="stat-chip-rate positive">${mobile ? "+86/day" : "+86.4/day"}</em></strong></button>
      ${manpowerChip(args)}
      <div class="stat-chip-def-wrap">
        <button class="stat-chip stat-chip-def${args.warnings ? " warning" : ""}" type="button"><span>${mobile ? "Integrity" : "Empire Integrity"}</span><strong>${args.warnings ? "82%" : "94%"}</strong></button>
      </div>
      ${devGearsChipHtml({ busy: devBusy, limit: args.devLimit, mobile })}
      ${ribbonHtml()}
    </div>
    ${panelActionsHtml()}
  </div>`;
};
