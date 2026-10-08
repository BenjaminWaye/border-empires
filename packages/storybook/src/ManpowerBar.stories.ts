import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/client-steampunk-theme-style.css";

/**
 * Design proposal: HUD manpower chip as a depletable bar with a periodic
 * (e.g. every 4h) refill instead of a continuous per-minute tick.
 *
 * Model shown here: regen still accrues continuously in the background
 * ("banked"), but only becomes spendable at the next refill boundary. The bar
 * therefore has four layers, left to right:
 *   1. available  – spendable now (solid)
 *   2. staged     – sitting in muster flags, already out of the pool (hatched)
 *   3. banked     – accrued this window, lands at the next refill (steam)
 *   4. empty      – headroom to the cap
 */

type ManpowerBarArgs = {
  available: number;
  cap: number;
  staged: number;
  regenPerMinute: number;
  refillWindowHours: number;
  minutesIntoWindow: number;
  overflow: number;
  mobile: boolean;
};

// Below this the fill turns ember: not enough for an ordinary attack.
const ATTACK_COST = 60;

// Built on the live client theme tokens (--sp-*) and fonts from
// client-steampunk-theme-style.css, imported above, so the mock matches the
// brass/copper/verdigris HUD chrome rather than inventing its own palette.
const STYLES = `
.sb-mp-stage {
  display: grid; gap: 22px; padding: 32px 28px;
  font-family: var(--sp-font-body);
  background: radial-gradient(circle at 50% 0%, var(--sp-iron-850) 0%, var(--sp-iron-950) 70%);
  color: var(--sp-parchment-100);
}
.sb-mp-note { margin: 0; max-width: 640px; font-size: 13px; line-height: 1.5; color: var(--sp-parchment-muted); }

/* HUD strip mock: same frame as #top-strip in the theme. */
.sb-mp-strip {
  display: flex; gap: 6px; align-items: stretch; flex-wrap: wrap; width: fit-content; padding: 6px;
  border-radius: 6px; border: 1px solid var(--sp-brass-700); background: var(--sp-panel-bg);
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(217,173,82,0.1);
}
.sb-mp-chip {
  position: relative; appearance: none; min-width: 74px; padding: 5px 8px; border-radius: 4px;
  border: 1px solid var(--sp-brass-700);
  background: linear-gradient(180deg, rgba(60,41,25,0.85), rgba(28,20,12,0.85));
  box-shadow: inset 0 1px 0 rgba(244,223,166,0.08);
  display: grid; line-height: 1.15; text-align: left; color: var(--sp-parchment-100); font: inherit;
}
.sb-mp-chip > span { font-family: var(--sp-font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sp-brass-300); }
.sb-mp-chip > strong { font-family: var(--sp-font-mono); font-size: 14px; color: var(--sp-brass-100); }

.sb-mp-chip-manpower { min-width: 176px; gap: 4px; cursor: pointer; transition: border-color .2s ease, box-shadow .2s ease; }
.sb-mp-chip-manpower:hover { border-color: var(--sp-brass-300); box-shadow: inset 0 1px 0 rgba(244,223,166,0.14), 0 0 10px rgba(217,173,82,0.18); }
.sb-mp-chip-manpower.is-mobile { min-width: 0; width: 100px; padding: 4px 5px; }
.sb-mp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sb-mp-head span { font-family: var(--sp-font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sp-brass-300); }
.sb-mp-value { font-family: var(--sp-font-mono); font-size: 14px; font-weight: 700; color: var(--sp-brass-100); text-shadow: 0 1px 0 rgba(0,0,0,0.6); }
.sb-mp-value small { font-size: 11px; font-weight: 400; color: var(--sp-parchment-muted); }
.is-mobile .sb-mp-value { font-size: 10.5px; }
.is-mobile .sb-mp-value small { font-size: 9px; }

/* Gauge: a glass tube in a brass collar, capped with rivets at each end. */
.sb-mp-gauge { position: relative; padding: 0 7px; }
.sb-mp-gauge::before, .sb-mp-gauge::after {
  content: ""; position: absolute; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--sp-brass-100), var(--sp-brass-500) 55%, var(--sp-brass-700));
  box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
}
.sb-mp-gauge::before { left: 0; }
.sb-mp-gauge::after { right: 0; }
.sb-mp-bar {
  position: relative; height: 9px; border-radius: 2px; overflow: hidden;
  border: 1px solid var(--sp-walnut-600);
  background: rgba(12,9,6,0.9);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.75), 0 0 0 1px rgba(138,97,31,0.35);
}
.is-mobile .sb-mp-bar { height: 6px; }
.is-mobile .sb-mp-gauge { padding: 0 5px; }
.is-mobile .sb-mp-gauge::before, .is-mobile .sb-mp-gauge::after { width: 4px; height: 4px; margin-top: -2px; }
/* Glass sheen sits above every fill layer. */
.sb-mp-bar::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 45%, rgba(0,0,0,0.25)); pointer-events: none; }

.sb-mp-seg { position: absolute; top: 0; bottom: 0; }
.sb-mp-seg-available {
  left: 0;
  background: linear-gradient(90deg, var(--sp-copper-600), var(--sp-brass-300) 60%, var(--sp-brass-100));
  box-shadow: 0 0 8px rgba(217,173,82,0.55);
  transition: width 420ms cubic-bezier(.2,.8,.2,1);
}
.sb-mp-chip-manpower.is-low .sb-mp-seg-available { background: linear-gradient(90deg, #7a2d10, var(--sp-ember-600), var(--sp-ember-400)); box-shadow: 0 0 8px rgba(226,121,58,0.55); }
.sb-mp-chip-manpower.is-low { border-color: var(--sp-copper-600); }
.sb-mp-chip-manpower.is-full .sb-mp-seg-available { background: linear-gradient(90deg, #2c5a4a, var(--sp-verdigris-500) 55%, var(--sp-verdigris-300)); box-shadow: 0 0 8px rgba(127,184,164,0.5); }
.sb-mp-chip-manpower.is-overflow { border-color: var(--sp-brass-300); }
.sb-mp-chip-manpower.is-overflow .sb-mp-seg-available {
  background: linear-gradient(90deg, var(--sp-brass-500), var(--sp-brass-100) 50%, var(--sp-brass-500));
  background-size: 200% 100%; animation: sbMpOverflow 2.2s linear infinite;
  box-shadow: 0 0 12px rgba(244,223,166,0.7);
}
@keyframes sbMpOverflow { from { background-position: 0 0; } to { background-position: -200% 0; } }
/* Manpower already pulled into muster flags: riveted copper plating. */
.sb-mp-seg-staged {
  background: repeating-linear-gradient(135deg, var(--sp-copper-400) 0 3px, var(--sp-copper-600) 3px 6px);
  box-shadow: inset 1px 0 0 rgba(0,0,0,0.6);
  opacity: 0.9;
}
/* Banked for the next refill: steam building up behind the glass. */
.sb-mp-seg-banked {
  background:
    linear-gradient(90deg, rgba(244,223,166,0.05), rgba(244,223,166,0.28)),
    repeating-linear-gradient(90deg, rgba(244,223,166,0.18) 0 2px, transparent 2px 5px);
  background-size: 100% 100%, 10px 100%;
  border-right: 1px solid rgba(244,223,166,0.75);
  animation: sbMpSteam 1.6s linear infinite, sbMpBankPulse 2.4s ease-in-out infinite;
}
@keyframes sbMpSteam { from { background-position: 0 0, 0 0; } to { background-position: 0 0, 10px 0; } }
@keyframes sbMpBankPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }

.sb-mp-foot { display: flex; justify-content: space-between; gap: 8px; font-family: var(--sp-font-mono); font-size: 10.5px; letter-spacing: 0.02em; white-space: nowrap; }
.sb-mp-refill { color: var(--sp-verdigris-300); }
.sb-mp-refill.is-capped { color: var(--sp-parchment-muted); }
.sb-mp-chip-manpower.is-overflow .sb-mp-refill { color: var(--sp-brass-100); }
.sb-mp-staged-label { color: var(--sp-copper-400); }
.is-mobile .sb-mp-foot { font-size: 9px; }

.sb-mp-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--sp-parchment-muted); }
.sb-mp-legend i { display: inline-block; width: 22px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid var(--sp-walnut-600); }
.sb-mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.sb-mp-case { display: grid; gap: 7px; align-content: start; }
.sb-mp-case h3 { margin: 0; font-family: var(--sp-font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--sp-brass-100); }
.sb-mp-case p { margin: 0; font-size: 12px; line-height: 1.45; color: var(--sp-parchment-muted); }

/* Tap-for-details panel: riveted brass card like .auth-panel. */
.sb-mp-popover {
  position: relative; width: min(300px, calc(100vw - 32px)); padding: 16px 18px; border-radius: 6px;
  border: 1px solid var(--sp-brass-700); background: var(--sp-panel-bg);
  box-shadow: 0 24px 56px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(217,173,82,0.12);
  font-size: 13px; line-height: 1.6;
}
.sb-mp-popover::before { content: ""; position: absolute; inset: 6px; border: 1px solid rgba(217,173,82,0.22); border-radius: 3px; pointer-events: none; }
.sb-mp-popover::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle, var(--sp-rivet-color) 0 2px, transparent 2.6px), radial-gradient(circle, var(--sp-rivet-color) 0 2px, transparent 2.6px), radial-gradient(circle, var(--sp-rivet-color) 0 2px, transparent 2.6px), radial-gradient(circle, var(--sp-rivet-color) 0 2px, transparent 2.6px);
  background-size: 6px 6px; background-repeat: no-repeat;
  background-position: 10px 10px, calc(100% - 10px) 10px, 10px calc(100% - 10px), calc(100% - 10px) calc(100% - 10px);
}
.sb-mp-popover strong { font-family: var(--sp-font-display); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sp-brass-100); }
.sb-mp-popover dl { margin: 8px 0 0; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; }
.sb-mp-popover dt { color: var(--sp-parchment-muted); }
.sb-mp-popover dd { margin: 0; text-align: right; font-family: var(--sp-font-mono); color: var(--sp-brass-100); }
`;

const ensureStyles = (): void => {
  if (document.getElementById("sb-mp-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-mp-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
};

const fmt = (value: number): string => Math.floor(value).toLocaleString();

const fmtDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const pct = (value: number, cap: number): number => (cap <= 0 ? 0 : Math.max(0, Math.min(100, (value / cap) * 100)));

type DerivedBar = {
  banked: number;
  minutesToRefill: number;
  refillCapped: boolean;
  stateClass: string;
};

const deriveBar = (args: ManpowerBarArgs): DerivedBar => {
  const windowMinutes = args.refillWindowHours * 60;
  const into = Math.max(0, Math.min(windowMinutes, args.minutesIntoWindow));
  // Banked can never push the pool past its cap: regen stops once
  // available + staged + banked would exceed it (staged flags count against
  // the cap the same way they do today, since they are out of the pool).
  const headroom = Math.max(0, args.cap - args.available - args.staged);
  const banked = Math.min(headroom, args.regenPerMinute * into);
  const refillCapped = headroom <= 0 || banked >= headroom;
  const stateClass =
    args.overflow > 0 ? "is-overflow" : args.available >= args.cap ? "is-full" : args.available < ATTACK_COST ? "is-low" : "";
  return { banked, minutesToRefill: windowMinutes - into, refillCapped, stateClass };
};

const renderChip = (args: ManpowerBarArgs): string => {
  const { banked, minutesToRefill, refillCapped, stateClass } = deriveBar(args);
  const shown = args.available + args.overflow;
  const availablePct = pct(Math.min(args.available + args.overflow, args.cap), args.cap);
  const stagedPct = pct(args.staged, args.cap);
  const bankedPct = pct(banked, args.cap);
  const label = args.mobile ? "MP" : "Manpower";
  const refillText = refillCapped
    ? args.overflow > 0
      ? `+${fmt(args.overflow)} over cap · regen paused`
      : args.available >= args.cap
      ? "Full"
      : `Full at refill · ${fmtDuration(minutesToRefill)}`
    : banked < 1
      ? `Next refill in ${fmtDuration(minutesToRefill)}`
      : `+${fmt(banked)} in ${fmtDuration(minutesToRefill)}`;
  const stagedText = args.staged > 0 && !args.mobile ? `<span class="sb-mp-staged-label">${fmt(args.staged)} mustered</span>` : "";
  const title = "Manpower gates attacks. Refills every " + args.refillWindowHours + "h. Tap for cap and regen breakdown.";
  return `
    <button class="sb-mp-chip sb-mp-chip-manpower ${stateClass} ${args.mobile ? "is-mobile" : ""}" type="button" title="${title}">
      <div class="sb-mp-head">
        <span>${label}</span>
        <div class="sb-mp-value">${fmt(shown)}<small>/${fmt(args.cap)}</small></div>
      </div>
      <div class="sb-mp-gauge"><div class="sb-mp-bar" role="meter" aria-valuemin="0" aria-valuemax="${args.cap}" aria-valuenow="${Math.floor(shown)}" aria-label="Manpower">
        <i class="sb-mp-seg sb-mp-seg-available" style="width:${availablePct}%"></i>
        <i class="sb-mp-seg sb-mp-seg-staged" style="left:${availablePct}%;width:${stagedPct}%"></i>
        <i class="sb-mp-seg sb-mp-seg-banked" style="left:${Math.min(100, availablePct + stagedPct)}%;width:${bankedPct}%"></i>
      </div></div>
      <div class="sb-mp-foot">
        <span class="sb-mp-refill ${refillCapped ? "is-capped" : ""}">${refillText}</span>
        ${stagedText}
      </div>
    </button>`;
};

const renderPopover = (args: ManpowerBarArgs): string => {
  const { banked, minutesToRefill } = deriveBar(args);
  const perRefill = args.regenPerMinute * args.refillWindowHours * 60;
  return `
    <div class="sb-mp-popover">
      <strong>Manpower</strong>
      <dl>
        <dt>Available now</dt><dd>${fmt(args.available + args.overflow)}</dd>
        <dt>In muster flags</dt><dd>${fmt(args.staged)}</dd>
        <dt>Banked for next refill</dt><dd>+${fmt(banked)}</dd>
        <dt>Next refill</dt><dd>${fmtDuration(minutesToRefill)}</dd>
        <dt>Per refill (every ${args.refillWindowHours}h)</dt><dd>+${fmt(perRefill)}</dd>
        <dt>Cap</dt><dd>${fmt(args.cap)}</dd>
      </dl>
    </div>`;
};

const LEGEND = `
  <div class="sb-mp-legend">
    <span><i style="background:linear-gradient(90deg,var(--sp-copper-600),var(--sp-brass-300) 60%,var(--sp-brass-100))"></i>Available</span>
    <span><i style="background:repeating-linear-gradient(135deg,var(--sp-copper-400) 0 3px,var(--sp-copper-600) 3px 6px)"></i>In muster flags</span>
    <span><i style="background:repeating-linear-gradient(90deg,rgba(244,223,166,.25) 0 2px,transparent 2px 5px),rgba(12,9,6,.9)"></i>Banked → next refill</span>
  </div>`;

const BASE: ManpowerBarArgs = {
  available: 412,
  cap: 720,
  staged: 0,
  regenPerMinute: 0.4,
  refillWindowHours: 4,
  minutesIntoWindow: 160,
  overflow: 0,
  mobile: false
};

const renderSingle = (args: ManpowerBarArgs): HTMLElement => {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "sb-mp-stage";
  root.innerHTML = `
    <div class="sb-mp-strip">
      <div class="sb-mp-chip"><span>Gold</span><strong>1,204</strong></div>
      ${renderChip(args)}
      <div class="sb-mp-chip"><span>Def</span><strong>1.4×</strong></div>
    </div>
    ${LEGEND}
    ${renderPopover(args)}`;
  return root;
};

type GalleryCase = { title: string; note: string; args: Partial<ManpowerBarArgs> };

const GALLERY: GalleryCase[] = [
  { title: "Mid pool, refill accruing", note: "Steam builds behind the glass through the window and snaps solid at the refill.", args: {} },
  { title: "Just refilled", note: "Window restarted: no steam yet, countdown shows the full 4h.", args: { available: 508, minutesIntoWindow: 0 } },
  { title: "Below attack cost", note: "Fill turns ember under 60 so the 'can't attack' state reads without the number.", args: { available: 42, minutesIntoWindow: 200 } },
  { title: "Empty", note: "Only the banked steam shows — tells the player exactly what is coming back.", args: { available: 0, minutesIntoWindow: 30 } },
  { title: "Muster flags staged", note: "Copper plating = manpower already pulled into flags; explains why the pool dropped.", args: { available: 210, staged: 180, minutesIntoWindow: 90 } },
  { title: "Refill will cap out", note: "Banked reaches the cap: footer warns that more waiting wastes regen.", args: { available: 600, regenPerMinute: 1.2, minutesIntoWindow: 180 } },
  { title: "Full", note: "Verdigris fill, no countdown.", args: { available: 720, minutesIntoWindow: 120 } },
  { title: "Waystation overflow", note: "Above cap: bright brass shimmer. Regen paused until spent back under.", args: { available: 720, overflow: 480, minutesIntoWindow: 60 } },
  { title: "Late game", note: "Big cap, faster regen: same gauge, larger refill chunk.", args: { available: 2_140, cap: 4_350, regenPerMinute: 4.6, minutesIntoWindow: 75 } },
  { title: "Mobile", note: "Compact chip: 'MP', 6px gauge, countdown only (mustered label hidden).", args: { mobile: true, staged: 120, available: 290 } }
];

const renderGallery = (): HTMLElement => {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "sb-mp-stage";
  root.innerHTML = `
    <p class="sb-mp-note">Proposal: manpower chip as a depletable bar with a periodic refill. Regen accrues continuously in the
    background (the steam behind the glass) and lands as one chunk at each refill boundary. Styled with the live
    client steampunk tokens (brass, copper, verdigris; Cinzel / Space Mono).</p>
    ${LEGEND}
    <div class="sb-mp-grid">
      ${GALLERY.map((c) => `
        <div class="sb-mp-case">
          <h3>${c.title}</h3>
          ${renderChip({ ...BASE, ...c.args })}
          <p>${c.note}</p>
        </div>`).join("")}
    </div>`;
  return root;
};

const meta: Meta<ManpowerBarArgs> = {
  title: "UI/HUD/Manpower Bar (proposal)",
  parameters: {
    backgrounds: { default: "game" },
    docs: {
      description: {
        component:
          "Design proposal for the HUD manpower chip: depletable bar with available / mustered / banked segments in a brass-and-glass gauge, and a countdown to the next periodic refill."
      }
    }
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
type Story = StoryObj<ManpowerBarArgs>;

export const AllStates: Story = { render: () => renderGallery(), parameters: { controls: { disable: true } } };
export const Playground: Story = { render: (args) => renderSingle(args) };
export const Mobile: Story = { render: (args) => renderSingle(args), args: { mobile: true, staged: 120, available: 290 } };
