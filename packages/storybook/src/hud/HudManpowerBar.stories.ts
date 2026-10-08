import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import { hudMarkup } from "@client/client-dom-markup/client-dom-markup.js";
import { selfPlayerChipHtml } from "@client/client-hud/client-stat-chips.js";
import { strategicRibbonHtml } from "@client/client-panel-html/client-panel-html.js";
import { rateToneClass } from "@client/client-app-runtime-utils.js";
import { ensureManpowerGaugeStyles, manpowerGaugeChipHtml, type ManpowerGaugeArgs } from "./manpower-gauge-mock.js";

/**
 * The real top HUD strip (#top-strip / #stats-chips with style.css and the
 * steampunk theme), rendered twice: today's manpower chip and the proposed
 * gauge chip. Mobile vs desktop follows the same `max-width: 900px` media
 * query the client uses, so resize the canvas (or use the viewport toolbar)
 * to switch layouts. Chip markup mirrors client-hud.ts:renderClientHud.
 */

type HudArgs = ManpowerGaugeArgs;

const RESOURCES = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 };
const NO_ANIM = { until: 0, dir: 0 as const };

const ribbonHtml = (): string =>
  strategicRibbonHtml(
    RESOURCES,
    RESOURCES,
    { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
    { FOOD: NO_ANIM, TITANIUM: NO_ANIM, CRYSTAL: NO_ANIM, UMBRITE: NO_ANIM, SHARD: NO_ANIM },
    rateToneClass,
    { supply: { FOOD: 6, TITANIUM: 2, CRYSTAL: 1, UMBRITE: 1 }, demand: { FOOD: 4, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 1 } }
  );

// Same chip order and markup as client-hud.ts (player chip is desktop-only).
const chipsHtml = (manpowerChip: string, mobile: boolean): string => `
  ${mobile ? "" : selfPlayerChipHtml("normal", "Aurelian", {})}
  <button class="stat-chip stat-chip-gold" type="button"><span>Coin</span><strong>1204.50 <em class="stat-chip-rate positive">${mobile ? "+86/day" : "+86.4/day"}</em></strong></button>
  ${manpowerChip}
  <div class="stat-chip-def-wrap">
    <button class="stat-chip stat-chip-def" type="button"><span>${mobile ? "Integrity" : "Empire Integrity"}</span><strong>94%</strong></button>
  </div>
  <button class="stat-chip stat-chip-dev" type="button"><span>${mobile ? "Dev" : "Development"}</span><strong>2/3</strong></button>
  ${ribbonHtml()}`;

const currentManpowerChipHtml = (args: HudArgs, mobile: boolean): string => {
  const shown = Math.floor(args.available + args.overflow);
  const rate = shown < args.cap ? `<em class="stat-chip-rate positive">+0.4/m</em>` : "";
  return `<button class="stat-chip stat-chip-manpower" type="button"><span>${mobile ? "MP" : "Manpower"}</span><strong>${shown}/${args.cap} ${rate}</strong></button>`;
};

const panelActionsHtml = (): string => {
  const doc = new DOMParser().parseFromString(`<div>${hudMarkup}</div>`, "text/html");
  return doc.getElementById("panel-actions")?.outerHTML ?? "";
};

const stripHtml = (chips: string): string => `
  <div id="top-strip" style="position:relative;top:auto;left:auto;right:auto;">
    <div id="stats-chips">${chips}</div>
    ${panelActionsHtml()}
  </div>`;

const render = (args: HudArgs): HTMLElement => {
  ensureManpowerGaugeStyles();
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;box-sizing:border-box;padding:12px 0;display:grid;gap:14px;align-content:start;" +
    "background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";
  const caption = (text: string): string =>
    `<div style="padding:0 12px;font-family:var(--sp-font-display);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--sp-brass-300);">${text}</div>`;
  root.innerHTML = `
    ${caption("Current")}
    <div style="padding:0 ${mobile ? 6 : 10}px;">${stripHtml(chipsHtml(currentManpowerChipHtml(args, mobile), mobile))}</div>
    ${caption("Proposed")}
    <div style="padding:0 ${mobile ? 6 : 10}px;">${stripHtml(chipsHtml(manpowerGaugeChipHtml({ ...args, mobile }), mobile))}</div>`;
  return root;
};

const meta: Meta<HudArgs> = {
  title: "UI/HUD/Manpower Bar in HUD (proposal)",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Real top HUD strip with today's manpower chip vs the proposed brass gauge chip. Layout switches at the client's 900px mobile breakpoint." } }
  },
  argTypes: {
    available: { control: { type: "range", min: 0, max: 1000, step: 1 } },
    cap: { control: { type: "range", min: 60, max: 2000, step: 10 } },
    staged: { control: { type: "range", min: 0, max: 500, step: 1 } },
    refillWindowHours: { control: { type: "select" }, options: [1, 2, 4, 6, 8] },
    minutesIntoWindow: { control: { type: "range", min: 0, max: 480, step: 5 } },
    overflow: { control: { type: "range", min: 0, max: 1000, step: 10 } },
    mobile: { table: { disable: true } }
  },
  args: { available: 412, cap: 720, staged: 0, refillWindowHours: 4, minutesIntoWindow: 160, overflow: 0, mobile: false },
  render
};

export default meta;
type Story = StoryObj<HudArgs>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const MobileWithMuster: Story = { args: { available: 210, staged: 180 }, globals: { viewport: { value: "mobile1", isRotated: false } } };
