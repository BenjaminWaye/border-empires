import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import { hudMarkup } from "@client/client-dom-markup/client-dom-markup.js";
import { selfPlayerChipHtml } from "@client/client-hud/client-stat-chips.js";
import { strategicRibbonHtml } from "@client/client-panel-html/client-panel-html.js";
import { rateToneClass } from "@client/client-app-runtime-utils.js";
import { ensureManpowerGaugeStyles, manpowerGaugeChipHtml, type ManpowerGaugeArgs } from "./manpower-gauge-mock.js";
import { devGearsChipHtml, ensureDevGearsStyles, DEV_GEARS_STRIP_CLASS } from "./dev-gears-mock.js";
import { ensureStatChipSteampunkStyles, STAT_CHIPS_STEAMPUNK_CLASS } from "./stat-chip-steampunk-mock.js";

/**
 * The real top HUD strip (#top-strip / #stats-chips with style.css and the
 * steampunk theme), rendered twice: today's manpower chip and the proposed
 * gauge chip with every stat chip restyled to the steampunk theme
 * (stat-chip-steampunk-mock.ts). Mobile vs desktop follows the same
 * `max-width: 900px` media query the client uses; like client-hud.ts, the
 * chip markup is picked at render time, so after resizing the canvas (or
 * switching the viewport toolbar) re-render the story to switch layouts.
 * Chip markup mirrors client-hud.ts:renderClientHud.
 */

// `warnings` shows the alert states: Integrity below 90%, every Development
// slot busy. devBusy/devLimit drive the Development chip.
type HudArgs = ManpowerGaugeArgs & { warnings: boolean; devBusy: number; devLimit: number };

const devBusyFor = (args: HudArgs): number => (args.warnings ? args.devLimit : Math.min(args.devBusy, args.devLimit));

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
const chipsHtml = (manpowerChip: string, devChip: string, mobile: boolean, warnings: boolean): string => `
  ${mobile ? "" : selfPlayerChipHtml("normal", "Aurelian", {})}
  <button class="stat-chip stat-chip-gold" type="button"><span>Coin</span><strong>1204.50 <em class="stat-chip-rate positive">${mobile ? "+86/day" : "+86.4/day"}</em></strong></button>
  ${manpowerChip}
  <div class="stat-chip-def-wrap">
    <button class="stat-chip stat-chip-def${warnings ? " warning" : ""}" type="button"><span>${mobile ? "Integrity" : "Empire Integrity"}</span><strong>${warnings ? "82%" : "94%"}</strong></button>
  </div>
  ${devChip}
  ${ribbonHtml()}`;

const currentDevChipHtml = (busy: number, limit: number, mobile: boolean): string =>
  `<button class="stat-chip stat-chip-dev${busy >= limit ? " is-full" : ""}" type="button"><span>${mobile ? "Dev" : "Development"}</span><strong>${busy}/${limit}</strong></button>`;

const currentManpowerChipHtml = (args: HudArgs, mobile: boolean): string => {
  const shown = Math.floor(args.available + args.overflow);
  const rate = shown < args.cap ? `<em class="stat-chip-rate positive">+0.4/m</em>` : "";
  return `<button class="stat-chip stat-chip-manpower" type="button"><span>${mobile ? "MP" : "Manpower"}</span><strong>${shown}/${args.cap} ${rate}</strong></button>`;
};

const panelActionsHtml = (): string => {
  const doc = new DOMParser().parseFromString(`<div>${hudMarkup}</div>`, "text/html");
  return doc.getElementById("panel-actions")?.outerHTML ?? "";
};

const stripHtml = (chips: string, extraClass = ""): string => `
  <div id="top-strip" class="${extraClass}" style="position:relative;top:auto;left:auto;right:auto;">
    <div id="stats-chips">${chips}</div>
    ${panelActionsHtml()}
  </div>`;

const render = (args: HudArgs): HTMLElement => {
  ensureManpowerGaugeStyles();
  ensureStatChipSteampunkStyles();
  ensureDevGearsStyles();
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;box-sizing:border-box;padding:12px 0;display:grid;gap:14px;align-content:start;" +
    "background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";
  const caption = (text: string): string =>
    `<div style="padding:0 12px;font-family:var(--sp-font-display);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--sp-brass-300);">${text}</div>`;
  root.innerHTML = `
    ${caption("Current")}
    <div style="padding:0 ${mobile ? 6 : 10}px;">${stripHtml(chipsHtml(currentManpowerChipHtml(args, mobile), currentDevChipHtml(devBusyFor(args), args.devLimit, mobile), mobile, args.warnings))}</div>
    ${caption("Proposed")}
    <div style="padding:0 ${mobile ? 6 : 10}px;">${stripHtml(chipsHtml(manpowerGaugeChipHtml({ ...args, mobile }), devGearsChipHtml({ busy: devBusyFor(args), limit: args.devLimit, mobile }), mobile, args.warnings), `${STAT_CHIPS_STEAMPUNK_CLASS} ${DEV_GEARS_STRIP_CLASS}`)}</div>`;
  return root;
};

const meta: Meta<HudArgs> = {
  title: "UI/HUD/Manpower Bar in HUD (proposal)",
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Real top HUD strip: today's chips vs the proposed brass gauge chip with all stat chips restyled to the steampunk theme. Layout switches at the client's 900px mobile breakpoint." } }
  },
  argTypes: {
    available: { control: { type: "range", min: 0, max: 1000, step: 1 } },
    cap: { control: { type: "range", min: 60, max: 2000, step: 10 } },
    staged: { control: { type: "range", min: 0, max: 500, step: 1 } },
    refillWindowHours: { control: { type: "select" }, options: [1, 2, 4, 6, 8] },
    minutesIntoWindow: { control: { type: "range", min: 0, max: 480, step: 5 } },
    overflow: { control: { type: "range", min: 0, max: 1000, step: 10 } },
    mobile: { table: { disable: true } },
    warnings: { control: "boolean" },
    devBusy: { control: { type: "range", min: 0, max: 6, step: 1 } },
    devLimit: { control: { type: "range", min: 1, max: 6, step: 1 } }
  },
  args: { available: 412, cap: 720, staged: 0, refillWindowHours: 4, minutesIntoWindow: 160, overflow: 0, mobile: false, warnings: false, devBusy: 2, devLimit: 3 },
  render
};

export default meta;
type Story = StoryObj<HudArgs>;

export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const MobileWithMuster: Story = { args: { available: 210, staged: 180 }, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const DesktopWarnings: Story = { args: { warnings: true, available: 42 } };
export const MobileWarnings: Story = { args: { warnings: true, available: 42 }, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const DesktopSixDevSlots: Story = { args: { devBusy: 4, devLimit: 6 } };
export const MobileSixDevSlots: Story = { args: { devBusy: 4, devLimit: 6 }, globals: { viewport: { value: "mobile1", isRotated: false } } };
