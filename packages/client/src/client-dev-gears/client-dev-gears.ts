/**
 * HUD Development chip as a gear train: one gear per development slot. Busy
 * slots are lit brass gears that turn (neighbours counter-rotate so the teeth
 * look meshed), idle slots are still iron cogs, and a full train glows copper.
 * The chip is as wide as its gears, so it takes far less HUD space than the
 * "Development 2/3" text it replaces. Styled in
 * client-steampunk-stat-chips-style.css. Same data as before:
 * developmentSlotSummary() -> { busy, limit }.
 */
export type DevGearsInput = { busy: number; limit: number; mobile: boolean };

/** Beyond this many slots a train no longer fits the HUD, so show "busy/limit" instead. */
export const MAX_DEV_GEARS = 8;

const TEETH = 8;

// Gear outline centred on (0,0) in a 24x24 viewBox: alternating outer/inner
// radius points give square-ish teeth.
const gearPath = (): string => {
  const outer = 11.5;
  const inner = 8.6;
  const step = (Math.PI * 2) / (TEETH * 4);
  const points: string[] = [];
  for (let index = 0; index < TEETH * 4; index += 1) {
    const radius = index % 4 < 2 ? outer : inner;
    const angle = index * step - step / 2;
    points.push(`${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
};

const GEAR_PATH = gearPath();

// Gradients referenced by url(#...) from every gear. Emitted inside each chip
// (duplicate ids resolve to the first, identical copy) so the chip never
// depends on a node injected elsewhere in the document.
const GEAR_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <radialGradient id="dev-gear-brass" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f4dfa6"/><stop offset="0.5" stop-color="#d9ad52"/><stop offset="1" stop-color="#8a611f"/></radialGradient>
    <radialGradient id="dev-gear-copper" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f0b48a"/><stop offset="0.5" stop-color="#c9713f"/><stop offset="1" stop-color="#7a3d1c"/></radialGradient>
  </defs></svg>`;

const gearSvg = (busy: boolean, index: number): string =>
  `<svg class="dev-gear${busy ? " is-busy" : ""}${index % 2 ? " is-ccw" : ""}" viewBox="-12 -12 24 24" aria-hidden="true"><path d="${GEAR_PATH}" class="dev-gear-body"></path><circle r="5.2" class="dev-gear-rim"></circle><circle r="2.1" class="dev-gear-hub"></circle></svg>`;

// The explicit width is needed: overlapping negative margins otherwise confuse
// the grid's auto track sizing and the last gear spills past the chip edge.
const trainWidthPx = (limit: number, mobile: boolean): number => {
  const size = mobile ? 15 : 20;
  const overlap = mobile ? 2 : 3;
  return limit * size - Math.max(0, limit - 1) * overlap + 2;
};

export const devGearsChipHtml = ({ busy, limit, mobile }: DevGearsInput): string => {
  const full = limit > 0 && busy >= limit;
  const label = `Development: ${busy} of ${limit} slots busy`;
  const title = `${label}. Development slots limit how many garrisons and constructions can run at once. Tap for breakdown.`;
  if (limit <= 0 || limit > MAX_DEV_GEARS) {
    return `<button class="stat-chip stat-chip-dev${full ? " is-full" : ""}" type="button" data-panel="development" title="${title}"><span>${mobile ? "Dev" : "Development"}</span><strong>${busy}/${limit}</strong></button>`;
  }
  const gears = Array.from({ length: limit }, (_, index) => gearSvg(index < busy, index)).join("");
  return `<button class="stat-chip stat-chip-dev dev-gears${full ? " is-full" : ""}" type="button" data-panel="development" title="${title}" aria-label="${label}">
      ${GEAR_DEFS}<span>Dev</span>
      <b class="dev-gear-train" style="width:${trainWidthPx(limit, mobile)}px">${gears}</b>
    </button>`;
};
