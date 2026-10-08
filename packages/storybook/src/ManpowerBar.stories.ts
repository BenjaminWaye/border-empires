import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import {
  ensureManpowerGaugeStyles,
  fmtDuration,
  fmtManpower,
  manpowerGaugeChipHtml,
  minutesToRefill,
  type ManpowerGaugeArgs
} from "./hud/manpower-gauge-mock.js";
import { ensureStatChipSteampunkStyles, STAT_CHIPS_STEAMPUNK_CLASS } from "./hud/stat-chip-steampunk-mock.js";

/**
 * Design proposal: HUD manpower chip as a depletable gauge with a periodic
 * (e.g. every 4h) refill instead of a continuous per-minute tick. The gauge
 * shows what is spendable now (brass) and what sits in muster flags (copper
 * plating); the chip's top row counts down to the next refill. See
 * "Manpower Bar in HUD" for the chip inside the real top strip.
 */

const STAGE_STYLES = `
.sb-mp-stage {
  display: grid; gap: 22px; align-content: start; padding: 32px 28px; min-height: 100vh; box-sizing: border-box;
  font-family: var(--sp-font-body);
  background: radial-gradient(circle at 50% 0%, var(--sp-iron-850) 0%, var(--sp-iron-950) 70%);
  color: var(--sp-parchment-100);
}
.sb-mp-note { margin: 0; max-width: 640px; font-size: 13px; line-height: 1.5; color: var(--sp-parchment-muted); }
.sb-mp-frame {
  display: flex; width: fit-content; padding: 6px; border-radius: 6px;
  border: 1px solid var(--sp-brass-700); background: var(--sp-panel-bg);
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(217,173,82,0.1);
}
.sb-mp-frame.is-mobile .stat-chip { width: 88px; min-width: 0; padding: 4px; border-radius: 12px; }
.sb-mp-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--sp-parchment-muted); }
.sb-mp-legend i { display: inline-block; width: 22px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid var(--sp-walnut-600); }
.sb-mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 20px; }
.sb-mp-case { display: grid; gap: 7px; align-content: start; }
.sb-mp-case h3 { margin: 0; font-family: var(--sp-font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--sp-brass-100); }
.sb-mp-case p { margin: 0; font-size: 12px; line-height: 1.45; color: var(--sp-parchment-muted); }
.sb-mp-popover {
  position: relative; width: min(300px, calc(100vw - 32px)); padding: 16px 18px; border-radius: 6px;
  border: 1px solid var(--sp-brass-700); background: var(--sp-panel-bg);
  box-shadow: 0 24px 56px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(217,173,82,0.12); font-size: 13px; line-height: 1.6;
}
.sb-mp-popover::before { content: ""; position: absolute; inset: 6px; border: 1px solid rgba(217,173,82,0.22); border-radius: 3px; pointer-events: none; }
.sb-mp-popover strong { font-family: var(--sp-font-display); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sp-brass-100); }
.sb-mp-popover dl { margin: 8px 0 0; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; }
.sb-mp-popover dt { color: var(--sp-parchment-muted); }
.sb-mp-popover dd { margin: 0; text-align: right; font-family: var(--sp-font-mono); color: var(--sp-brass-100); }
`;

type BarArgs = ManpowerGaugeArgs & { regenPerMinute: number };

const ensureStyles = (): void => {
  ensureManpowerGaugeStyles();
  ensureStatChipSteampunkStyles();
  if (document.getElementById("sb-mp-stage-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-mp-stage-styles";
  style.textContent = STAGE_STYLES;
  document.head.appendChild(style);
};

const framed = (args: ManpowerGaugeArgs): string =>
  `<div class="sb-mp-frame ${STAT_CHIPS_STEAMPUNK_CLASS} ${args.mobile ? "is-mobile" : ""}">${manpowerGaugeChipHtml(args)}</div>`;

const popoverHtml = (args: BarArgs): string => `
  <div class="sb-mp-popover">
    <strong>Manpower</strong>
    <dl>
      <dt>Available now</dt><dd>${fmtManpower(args.available + args.overflow)}</dd>
      <dt>In muster flags</dt><dd>${fmtManpower(args.staged)}</dd>
      <dt>Next refill</dt><dd>${fmtDuration(minutesToRefill(args))}</dd>
      <dt>Per refill (every ${args.refillWindowHours}h)</dt><dd>+${fmtManpower(args.regenPerMinute * args.refillWindowHours * 60)}</dd>
      <dt>Cap</dt><dd>${fmtManpower(args.cap)}</dd>
    </dl>
  </div>`;

const LEGEND = `
  <div class="sb-mp-legend">
    <span><i style="background:linear-gradient(90deg,var(--sp-copper-600),var(--sp-brass-300) 60%,var(--sp-brass-100))"></i>Available</span>
    <span><i style="background:repeating-linear-gradient(135deg,var(--sp-copper-400) 0 3px,var(--sp-copper-600) 3px 6px)"></i>In muster flags</span>
  </div>`;

const BASE: BarArgs = {
  available: 412,
  cap: 720,
  staged: 0,
  regenPerMinute: 0.4,
  refillWindowHours: 4,
  minutesIntoWindow: 160,
  overflow: 0,
  mobile: false
};

type GalleryCase = { title: string; note: string; args: Partial<BarArgs> };

const GALLERY: GalleryCase[] = [
  { title: "Mid pool", note: "Brass fill, countdown to the next refill.", args: {} },
  { title: "Below attack cost", note: "Fill turns ember under 60 so the 'can't attack' state reads without the number.", args: { available: 42, minutesIntoWindow: 200 } },
  { title: "Empty", note: "Empty tube; the countdown says when it comes back.", args: { available: 0, minutesIntoWindow: 30 } },
  { title: "Muster flags staged", note: "Copper plating = manpower already pulled into flags; explains why the pool dropped.", args: { available: 210, staged: 180, minutesIntoWindow: 90 } },
  { title: "Full", note: "Verdigris fill, countdown replaced by 'Full'.", args: { available: 720 } },
  { title: "Waystation overflow", note: "Above cap: bright brass shimmer. Regen paused until spent back under.", args: { available: 720, overflow: 480 } },
  { title: "Late game", note: "Big cap: same gauge.", args: { available: 2_140, cap: 4_350, minutesIntoWindow: 75 } },
  { title: "Mobile", note: "Same height as neighbouring chips; gauge runs along the bottom edge.", args: { mobile: true, staged: 120, available: 290 } }
];

const renderGallery = (): HTMLElement => {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "sb-mp-stage";
  root.innerHTML = `
    <p class="sb-mp-note">Proposal: manpower chip as a depletable gauge with a periodic refill, styled with the live client
    steampunk tokens (brass, copper, verdigris; Cinzel / Space Mono).</p>
    ${LEGEND}
    <div class="sb-mp-grid">
      ${GALLERY.map((c) => `
        <div class="sb-mp-case">
          <h3>${c.title}</h3>
          ${framed({ ...BASE, ...c.args })}
          <p>${c.note}</p>
        </div>`).join("")}
    </div>`;
  return root;
};

const renderSingle = (args: BarArgs): HTMLElement => {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "sb-mp-stage";
  root.innerHTML = `${framed(args)}${LEGEND}${popoverHtml(args)}`;
  return root;
};

const meta: Meta<BarArgs> = {
  title: "UI/HUD/Manpower Bar (proposal)",
  parameters: {
    docs: { description: { component: "Design proposal for the HUD manpower chip: brass-and-glass gauge (available + mustered) with a countdown to the next periodic refill." } }
  },
  argTypes: {
    available: { control: { type: "range", min: 0, max: 5000, step: 1 } },
    cap: { control: { type: "range", min: 60, max: 5000, step: 10 } },
    staged: { control: { type: "range", min: 0, max: 2000, step: 1 } },
    regenPerMinute: { control: { type: "range", min: 0, max: 8, step: 0.05 } },
    refillWindowHours: { control: { type: "select" }, options: [1, 2, 4, 6, 8] },
    minutesIntoWindow: { control: { type: "range", min: 0, max: 480, step: 5 } },
    overflow: { control: { type: "range", min: 0, max: 1000, step: 10 } },
    mobile: { control: "boolean" }
  },
  args: BASE
};

export default meta;
type Story = StoryObj<BarArgs>;

export const AllStates: Story = { render: () => renderGallery(), parameters: { controls: { disable: true } } };
export const Playground: Story = { render: (args) => renderSingle(args) };
