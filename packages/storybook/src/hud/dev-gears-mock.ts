/**
 * Proposed Development chip: one brass gear per development slot instead of
 * the "busy/limit" text. Busy slots are lit gears that turn (neighbours mesh
 * and counter-rotate); idle slots are dim, still iron cogs. When every slot
 * is busy the gear train glows copper, matching the old `is-full` state.
 * The chip sizes to its gears, so it is much narrower than "Development 2/3".
 * Same data as today: developmentSlotSummary() → { busy, limit }.
 */

export type DevGearsArgs = { busy: number; limit: number; mobile: boolean };

const TEETH = 8;

// Gear outline centred on (0,0) in a 24×24 viewBox: alternating outer/inner
// radius points give square-ish teeth.
const gearPath = (): string => {
  const outer = 11.5;
  const inner = 8.6;
  const points: string[] = [];
  const step = (Math.PI * 2) / (TEETH * 4);
  for (let i = 0; i < TEETH * 4; i += 1) {
    const r = i % 4 < 2 ? outer : inner;
    const a = i * step - step / 2;
    points.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
};

const GEAR_PATH = gearPath();

const gearSvg = (busy: boolean, index: number): string => `
  <svg class="sb-dev-gear ${busy ? "is-busy" : ""} ${index % 2 ? "is-ccw" : ""}" viewBox="-12 -12 24 24" aria-hidden="true">
    <path d="${GEAR_PATH}" class="sb-dev-gear-body"></path>
    <circle r="5.2" class="sb-dev-gear-rim"></circle>
    <circle r="2.1" class="sb-dev-gear-hub"></circle>
  </svg>`;

const STYLES = `
.sb-dev-gears { gap: 2px; justify-items: start; }
/* style.css gives .stat-chip-dev min-width: 88px; the gear train sizes the chip instead. */
.stat-chip.sb-dev-gears { min-width: 0; width: max-content; }
.sb-dev-train { display: flex; align-items: center; height: 20px; padding-left: 1px; }
.sb-dev-gear { width: 20px; height: 20px; flex: 0 0 auto; overflow: visible; }
/* Pull neighbours in so their teeth interlock. */
.sb-dev-gear + .sb-dev-gear { margin-left: -3px; }
.sb-dev-gear:nth-child(even) { transform: translateY(2px) rotate(22.5deg); }
.sb-dev-gear-body { fill: #3d3024; stroke: var(--sp-brass-700); stroke-width: 1; opacity: 0.85; }
.sb-dev-gear-rim { fill: none; stroke: rgba(0,0,0,0.55); stroke-width: 1.2; }
.sb-dev-gear-hub { fill: var(--sp-iron-950); stroke: var(--sp-brass-700); stroke-width: 0.8; }
.sb-dev-gear.is-busy .sb-dev-gear-body { fill: url(#sb-dev-brass); opacity: 1; }
.sb-dev-gear.is-busy { filter: drop-shadow(0 0 3px rgba(217,173,82,0.55)); }
.sb-dev-gear.is-busy .sb-dev-gear-body,
.sb-dev-gear.is-busy .sb-dev-gear-rim { transform-origin: 0 0; animation: sbDevSpin 2.4s linear infinite; }
.sb-dev-gear.is-busy.is-ccw .sb-dev-gear-body,
.sb-dev-gear.is-busy.is-ccw .sb-dev-gear-rim { animation-direction: reverse; }
@keyframes sbDevSpin { to { transform: rotate(360deg); } }
.sb-dev-gears.is-full { border-color: var(--sp-copper-400); }
.sb-dev-gears.is-full .sb-dev-gear.is-busy { filter: drop-shadow(0 0 4px rgba(201,113,63,0.75)); }
.sb-dev-gears.is-full .sb-dev-gear.is-busy .sb-dev-gear-body { fill: url(#sb-dev-copper); }
@media (prefers-reduced-motion: reduce) { .sb-dev-gear .sb-dev-gear-body, .sb-dev-gear .sb-dev-gear-rim { animation: none !important; } }

.sb-dev-gears.is-mobile { justify-items: center; justify-self: stretch; width: auto; }
/* Mobile: Dev's column shrinks to its gears; Manpower takes the slack. */
@media (max-width: 900px) {
  #top-strip.sb-dev-compact #stats-chips { grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr) auto; }
}
.sb-dev-gears.is-mobile .sb-dev-train { height: 16px; }
.sb-dev-gears.is-mobile .sb-dev-gear { width: 15px; height: 15px; }
.sb-dev-gears.is-mobile .sb-dev-gear + .sb-dev-gear { margin-left: -2px; }
`;

// Gradients referenced by url(#…) from every gear. Emitted inside each chip
// (duplicate ids resolve to the first, identical copy) so a chip never
// depends on a node injected elsewhere in the document.
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="sb-dev-brass" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f4dfa6"/><stop offset="0.5" stop-color="#d9ad52"/><stop offset="1" stop-color="#8a611f"/></radialGradient>
  <radialGradient id="sb-dev-copper" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f0b48a"/><stop offset="0.5" stop-color="#c9713f"/><stop offset="1" stop-color="#7a3d1c"/></radialGradient>
</defs></svg>`;

export const DEV_GEARS_STRIP_CLASS = "sb-dev-compact";

export const ensureDevGearsStyles = (): void => {
  if (document.getElementById("sb-dev-gears-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-dev-gears-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
};

// Explicit width: overlapping negative margins otherwise confuse the grid's
// auto track sizing and the last gear spills past the chip edge.
const trainWidth = (args: DevGearsArgs): number => {
  const size = args.mobile ? 15 : 20;
  const overlap = args.mobile ? 2 : 3;
  return args.limit * size - Math.max(0, args.limit - 1) * overlap + 2;
};

export const devGearsChipHtml = (args: DevGearsArgs): string => {
  const full = args.busy >= args.limit;
  const label = `Development: ${args.busy} of ${args.limit} slots busy`;
  const gears = Array.from({ length: args.limit }, (_, i) => gearSvg(i < args.busy, i)).join("");
  return `<button class="stat-chip stat-chip-dev sb-dev-gears ${full ? "is-full" : ""} ${args.mobile ? "is-mobile" : ""}" type="button" data-panel="development" title="${label}. Tap for breakdown." aria-label="${label}">
    ${DEFS}<span>Dev</span>
    <b class="sb-dev-train" style="width:${trainWidth(args)}px">${gears}</b>
  </button>`;
};
