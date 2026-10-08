/**
 * Shared mock for the proposed HUD manpower chip: a depletable brass-and-glass
 * gauge with a countdown to the next periodic refill. Used by the standalone
 * ManpowerBar story and by the full HUD-strip story so both render the same
 * markup. Builds on the client's real `.stat-chip` box and the --sp-* tokens
 * from client-steampunk-theme-style.css (callers import those stylesheets).
 *
 * Layout keeps the chip the same height as its neighbours:
 *   desktop – row 1: label · refill countdown; row 2: value + inline gauge
 *   mobile  – row 1: label · countdown; row 2: value; gauge is a thin strip
 *             along the chip's bottom edge
 */

export type ManpowerGaugeArgs = {
  available: number;
  cap: number;
  staged: number;
  refillWindowHours: number;
  minutesIntoWindow: number;
  overflow: number;
  mobile: boolean;
};

// Below this the fill turns ember: not enough for an ordinary attack.
const ATTACK_COST = 60;

// Elements are <b>/<i>, not <span>, so style.css's `.stat-chip span` label
// rule (uppercase, 10px) does not leak into the value and gauge.
const STYLES = `
.sb-mp-chip-manpower { position: relative; gap: 2px; cursor: pointer; }
.sb-mp-chip-manpower:not(.is-mobile) { min-width: 196px; }
.sb-mp-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.sb-mp-chip-manpower .sb-mp-label {
  font-family: var(--sp-font-display); font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--sp-brass-300);
}
.sb-mp-refill { font-family: var(--sp-font-mono); font-size: 10px; font-weight: 400; color: var(--sp-verdigris-300); white-space: nowrap; }
.sb-mp-refill.is-quiet { color: var(--sp-parchment-muted); }
.sb-mp-chip-manpower.is-overflow .sb-mp-refill { color: var(--sp-brass-100); }
.sb-mp-value {
  font-family: var(--sp-font-mono); font-size: 14px; font-weight: 700; color: var(--sp-brass-100);
  text-shadow: 0 1px 0 rgba(0,0,0,0.6); white-space: nowrap; flex: 0 0 auto;
}
.sb-mp-value small { font-size: 11px; font-weight: 400; color: var(--sp-parchment-muted); }

/* Gauge: glass tube in a brass collar with rivet end caps. */
.sb-mp-gauge { position: relative; flex: 1 1 auto; min-width: 40px; padding: 0 6px; display: block; }
.sb-mp-gauge::before, .sb-mp-gauge::after {
  content: ""; position: absolute; top: 50%; width: 5px; height: 5px; margin-top: -2.5px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--sp-brass-100), var(--sp-brass-500) 55%, var(--sp-brass-700));
  box-shadow: 0 0 0 1px rgba(0,0,0,0.55);
}
.sb-mp-gauge::before { left: 0; }
.sb-mp-gauge::after { right: 0; }
.sb-mp-bar {
  position: relative; display: block; height: 8px; border-radius: 2px; overflow: hidden;
  border: 1px solid var(--sp-walnut-600); background: rgba(12,9,6,0.9);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.75), 0 0 0 1px rgba(138,97,31,0.35);
}
.sb-mp-bar::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 45%, rgba(0,0,0,0.25)); }
.sb-mp-seg { position: absolute; top: 0; bottom: 0; display: block; }
.sb-mp-seg-available {
  left: 0; background: linear-gradient(90deg, var(--sp-copper-600), var(--sp-brass-300) 60%, var(--sp-brass-100));
  box-shadow: 0 0 8px rgba(217,173,82,0.55); transition: width 420ms cubic-bezier(.2,.8,.2,1);
}
.sb-mp-seg-staged { background: repeating-linear-gradient(135deg, var(--sp-copper-400) 0 3px, var(--sp-copper-600) 3px 6px); box-shadow: inset 1px 0 0 rgba(0,0,0,0.6); }
.sb-mp-chip-manpower.is-low .sb-mp-seg-available { background: linear-gradient(90deg, #7a2d10, var(--sp-ember-600), var(--sp-ember-400)); box-shadow: 0 0 8px rgba(226,121,58,0.55); }
.sb-mp-chip-manpower.is-full .sb-mp-seg-available { background: linear-gradient(90deg, #2c5a4a, var(--sp-verdigris-500) 55%, var(--sp-verdigris-300)); box-shadow: 0 0 8px rgba(127,184,164,0.5); }
.sb-mp-chip-manpower.is-overflow .sb-mp-seg-available {
  background: linear-gradient(90deg, var(--sp-brass-500), var(--sp-brass-100) 50%, var(--sp-brass-500));
  background-size: 200% 100%; animation: sbMpOverflow 2.2s linear infinite; box-shadow: 0 0 12px rgba(244,223,166,0.7);
}
@keyframes sbMpOverflow { from { background-position: 0 0; } to { background-position: -200% 0; } }

/* Mobile: the gauge becomes a thin strip on the chip's bottom edge. */
.sb-mp-chip-manpower.is-mobile { padding-bottom: 9px; gap: 0; }
.sb-mp-chip-manpower.is-mobile .sb-mp-label { font-size: 8px; letter-spacing: 0.06em; }
.sb-mp-chip-manpower.is-mobile .sb-mp-refill { font-size: 8.5px; }
.sb-mp-chip-manpower.is-mobile .sb-mp-value { font-size: 10.5px; }
.sb-mp-chip-manpower.is-mobile .sb-mp-value small { font-size: 9px; }
.sb-mp-chip-manpower.is-mobile .sb-mp-gauge { position: absolute; left: 3px; right: 3px; bottom: 2px; min-width: 0; padding: 0 4px; }
.sb-mp-chip-manpower.is-mobile .sb-mp-gauge::before, .sb-mp-chip-manpower.is-mobile .sb-mp-gauge::after { width: 3px; height: 3px; margin-top: -1.5px; }
.sb-mp-chip-manpower.is-mobile .sb-mp-bar { height: 4px; border-radius: 1px; }
`;

export const ensureManpowerGaugeStyles = (): void => {
  if (document.getElementById("sb-mp-gauge-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-mp-gauge-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
};

export const fmtManpower = (value: number): string => Math.floor(value).toLocaleString();

export const fmtDuration = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const pct = (value: number, cap: number): number => (cap <= 0 ? 0 : Math.max(0, Math.min(100, (value / cap) * 100)));

export const minutesToRefill = (args: ManpowerGaugeArgs): number => {
  const windowMinutes = args.refillWindowHours * 60;
  return windowMinutes - Math.max(0, Math.min(windowMinutes, args.minutesIntoWindow));
};

const stateClassFor = (args: ManpowerGaugeArgs): string =>
  args.overflow > 0 ? "is-overflow" : args.available >= args.cap ? "is-full" : args.available < ATTACK_COST ? "is-low" : "";

const refillTextFor = (args: ManpowerGaugeArgs): { text: string; quiet: boolean } => {
  if (args.overflow > 0) return { text: args.mobile ? `+${fmtManpower(args.overflow)}` : `+${fmtManpower(args.overflow)} over cap`, quiet: false };
  if (args.available + args.staged >= args.cap) return { text: "Full", quiet: true };
  const eta = fmtDuration(minutesToRefill(args));
  return { text: args.mobile ? eta : `Refill in ${eta}`, quiet: false };
};

export const manpowerGaugeChipHtml = (args: ManpowerGaugeArgs): string => {
  const shown = args.available + args.overflow;
  const availablePct = pct(Math.min(shown, args.cap), args.cap);
  const stagedPct = pct(args.staged, args.cap);
  const refill = refillTextFor(args);
  const title = `Manpower gates attacks. Refills every ${args.refillWindowHours}h. Tap for cap and regen breakdown.`;
  return `<button class="stat-chip stat-chip-manpower sb-mp-chip-manpower ${stateClassFor(args)} ${args.mobile ? "is-mobile" : ""}" type="button" data-panel="manpower" title="${title}">
    <b class="sb-mp-row"><b class="sb-mp-label">${args.mobile ? "MP" : "Manpower"}</b><i class="sb-mp-refill ${refill.quiet ? "is-quiet" : ""}">${refill.text}</i></b>
    <b class="sb-mp-row">
      <b class="sb-mp-value">${fmtManpower(shown)}<small>/${fmtManpower(args.cap)}</small></b>
      <i class="sb-mp-gauge"><i class="sb-mp-bar" role="meter" aria-label="Manpower" aria-valuemin="0" aria-valuemax="${args.cap}" aria-valuenow="${Math.floor(shown)}">
        <i class="sb-mp-seg sb-mp-seg-available" style="width:${availablePct}%"></i>
        <i class="sb-mp-seg sb-mp-seg-staged" style="left:${availablePct}%;width:${stagedPct}%"></i>
      </i></i>
    </b>
  </button>`;
};
