import type { Meta, StoryObj } from "@storybook/html-vite";

/**
 * Design proposal: HUD manpower chip as a depletable bar with a periodic
 * (e.g. every 4h) refill instead of a continuous per-minute tick.
 *
 * Model shown here: regen still accrues continuously in the background
 * ("banked"), but only becomes spendable at the next refill boundary. The bar
 * therefore has four layers, left to right:
 *   1. available  – spendable now (solid)
 *   2. staged     – sitting in muster flags, already out of the pool (hatched)
 *   3. banked     – accrued this window, lands at the next refill (ghost)
 *   4. empty      – headroom to the cap
 * Tick marks at the ATTACK (60) and DEEP STRIKE (120) costs answer
 * "can I attack right now?" at a glance.
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

const ATTACK_COST = 60;
const DEEP_STRIKE_COST = 120;

const STYLES = `
.sb-mp-stage { display: grid; gap: 22px; padding: 32px 28px; font-family: system-ui, sans-serif; background: #0a0e14; color: #f2f7ff; }
.sb-mp-note { margin: 0; max-width: 640px; font-size: 12.5px; line-height: 1.5; color: rgba(201, 216, 236, 0.62); }
.sb-mp-row { display: flex; gap: 6px; align-items: stretch; flex-wrap: wrap; }
.sb-mp-chip {
  appearance: none; min-width: 74px; padding: 4px 7px; border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06);
  display: grid; line-height: 1.15; text-align: left; color: inherit; font: inherit;
}
.sb-mp-chip > span { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(226,237,255,0.7); }
.sb-mp-chip > strong { font-size: 14px; color: #f2f7ff; }
.sb-mp-chip-manpower { min-width: 168px; gap: 3px; cursor: pointer; }
.sb-mp-chip-manpower.is-mobile { min-width: 0; width: 96px; padding: 4px; border-radius: 12px; }
.sb-mp-chip-manpower.is-mobile > strong { font-size: 10px; }
.sb-mp-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.sb-mp-head span { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(226,237,255,0.7); }
.sb-mp-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sb-mp-value small { font-size: 11px; font-weight: 600; color: rgba(226,237,255,0.55); }
.is-mobile .sb-mp-value { font-size: 10px; }
.is-mobile .sb-mp-value small { font-size: 9px; }

.sb-mp-bar {
  position: relative; height: 7px; border-radius: 999px; overflow: hidden;
  background: rgba(191,216,245,0.10); box-shadow: inset 0 1px 0 rgba(0,0,0,0.35);
}
.is-mobile .sb-mp-bar { height: 5px; }
.sb-mp-seg { position: absolute; top: 0; bottom: 0; }
.sb-mp-seg-available {
  left: 0; background: linear-gradient(180deg, #8fd3ff, #3f8fd8);
  box-shadow: 0 0 10px rgba(110,190,255,0.35);
  transition: width 420ms cubic-bezier(.2,.8,.2,1);
}
.sb-mp-chip-manpower.is-low .sb-mp-seg-available { background: linear-gradient(180deg, #ffb27a, #d8693f); box-shadow: 0 0 10px rgba(255,140,90,0.3); }
.sb-mp-chip-manpower.is-full .sb-mp-seg-available { background: linear-gradient(180deg, #a6f0c4, #3fb877); box-shadow: 0 0 10px rgba(110,240,170,0.3); }
.sb-mp-chip-manpower.is-overflow .sb-mp-seg-available { background: linear-gradient(180deg, #ffe08f, #e0a63a); box-shadow: 0 0 12px rgba(255,214,120,0.45); }
.sb-mp-seg-staged {
  background: repeating-linear-gradient(135deg, rgba(255,214,148,0.75) 0 3px, rgba(214,150,68,0.35) 3px 6px);
}
.sb-mp-seg-banked {
  background: rgba(143,211,255,0.22);
  border-right: 1px dashed rgba(143,211,255,0.7);
  animation: sbMpBankPulse 2.4s ease-in-out infinite;
}
@keyframes sbMpBankPulse { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
.sb-mp-tick { position: absolute; top: -1px; bottom: -1px; width: 1px; background: rgba(255,255,255,0.55); }
.sb-mp-tick.is-reached { background: rgba(10,14,20,0.7); }

.sb-mp-foot { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
.sb-mp-refill { color: #8fd3ff; }
.sb-mp-refill.is-capped { color: rgba(225,238,255,0.5); }
.sb-mp-staged-label { color: #ffd68f; }
.is-mobile .sb-mp-foot { font-size: 9px; }

.sb-mp-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: rgba(226,237,255,0.7); }
.sb-mp-legend i { display: inline-block; width: 18px; height: 7px; border-radius: 999px; margin-right: 6px; vertical-align: middle; }
.sb-mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
.sb-mp-case { display: grid; gap: 6px; align-content: start; }
.sb-mp-case h3 { margin: 0; font-size: 12px; font-weight: 800; color: #ffd68f; }
.sb-mp-case p { margin: 0; font-size: 11.5px; line-height: 1.45; color: rgba(201,216,236,0.6); }
.sb-mp-popover {
  width: min(300px, calc(100vw - 32px)); padding: 12px 14px; border-radius: 12px;
  border: 1px solid rgba(143,211,255,0.25); background: rgba(14,20,30,0.98);
  box-shadow: 0 18px 48px rgba(0,0,0,0.45); font-size: 12px; line-height: 1.55;
}
.sb-mp-popover dl { margin: 6px 0 0; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; }
.sb-mp-popover dt { color: rgba(226,237,255,0.65); }
.sb-mp-popover dd { margin: 0; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
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
  const ticks = [ATTACK_COST, DEEP_STRIKE_COST]
    .filter((cost) => cost < args.cap)
    .map((cost) => `<i class="sb-mp-tick ${shown >= cost ? "is-reached" : ""}" style="left:${pct(cost, args.cap)}%" title="${cost === ATTACK_COST ? "Attack" : "Deep Strike"} · ${cost}"></i>`)
    .join("");
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
      <div class="sb-mp-bar" role="meter" aria-valuemin="0" aria-valuemax="${args.cap}" aria-valuenow="${Math.floor(shown)}" aria-label="Manpower">
        <i class="sb-mp-seg sb-mp-seg-available" style="width:${availablePct}%"></i>
        <i class="sb-mp-seg sb-mp-seg-staged" style="left:${availablePct}%;width:${stagedPct}%"></i>
        <i class="sb-mp-seg sb-mp-seg-banked" style="left:${Math.min(100, availablePct + stagedPct)}%;width:${bankedPct}%"></i>
        ${ticks}
      </div>
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
    <span><i style="background:linear-gradient(180deg,#8fd3ff,#3f8fd8)"></i>Available</span>
    <span><i style="background:repeating-linear-gradient(135deg,rgba(255,214,148,.75) 0 3px,rgba(214,150,68,.35) 3px 6px)"></i>In muster flags</span>
    <span><i style="background:rgba(143,211,255,.22);border:1px dashed rgba(143,211,255,.7)"></i>Banked → next refill</span>
    <span><i style="background:rgba(191,216,245,.10);box-shadow:inset 1px 0 0 #fff,inset -1px 0 0 #fff"></i>Ticks: Attack 60 · Deep Strike 120</span>
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
    <div class="sb-mp-row">
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
  { title: "Mid pool, refill accruing", note: "Ghost segment grows through the window and snaps solid at the refill.", args: {} },
  { title: "Just refilled", note: "Window restarted: no ghost yet, countdown shows the full 4h.", args: { available: 508, minutesIntoWindow: 0 } },
  { title: "Below attack cost", note: "Fill turns orange under 60 so the 'can't attack' state reads without the number.", args: { available: 42, minutesIntoWindow: 200 } },
  { title: "Empty", note: "Only the banked ghost shows — tells the player exactly what is coming back.", args: { available: 0, minutesIntoWindow: 30 } },
  { title: "Muster flags staged", note: "Hatched segment = manpower already pulled into flags; explains why the pool dropped.", args: { available: 210, staged: 180, minutesIntoWindow: 90 } },
  { title: "Refill will cap out", note: "Banked reaches the cap: footer warns that more waiting wastes regen.", args: { available: 600, regenPerMinute: 1.2, minutesIntoWindow: 180 } },
  { title: "Full", note: "Green fill, no countdown.", args: { available: 720, minutesIntoWindow: 120 } },
  { title: "Waystation overflow", note: "Above cap (gold). Regen paused until spent back under.", args: { available: 720, overflow: 480, minutesIntoWindow: 60 } },
  { title: "Late game", note: "Big cap, faster regen: same bar, ticks shrink toward the left edge.", args: { available: 2_140, cap: 4_350, regenPerMinute: 4.6, minutesIntoWindow: 75 } },
  { title: "Mobile", note: "Compact chip: 'MP', 5px bar, countdown only (mustered label hidden).", args: { mobile: true, staged: 120, available: 290 } }
];

const renderGallery = (): HTMLElement => {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "sb-mp-stage";
  root.innerHTML = `
    <p class="sb-mp-note">Proposal: manpower chip as a depletable bar with a periodic refill. Regen accrues continuously in the
    background (ghost segment) and lands as one chunk at each refill boundary. Tick marks show the Attack (60) and
    Deep Strike (120) costs.</p>
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
          "Design proposal for the HUD manpower chip: depletable bar with available / mustered / banked segments, attack-cost ticks, and a countdown to the next periodic refill."
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
