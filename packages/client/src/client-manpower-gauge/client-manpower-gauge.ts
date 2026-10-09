import { ATTACK_MANPOWER_MIN, MANPOWER_REFILL_WINDOW_MS } from "@border-empires/shared";
import { formatRefillCountdown } from "./client-manpower-refill.js";

/**
 * HUD manpower chip as a brass-and-glass gauge: how much is spendable now
 * (brass; ember below an ordinary attack, verdigris when full, shimmering when
 * above the cap from a waystation), how much sits in muster flags (copper
 * plating), and a countdown to the next periodic refill. Styled in
 * client-steampunk-stat-chips-style.css. Child elements are <b>/<i> rather
 * than <span> so style.css's `.stat-chip span` label rule doesn't apply.
 */
export type ManpowerGaugeInput = {
  manpower: number;
  manpowerCap: number;
  /** Manpower already pulled into the player's muster flags (out of the pool). */
  staged: number;
  regenPerMinute: number;
  /** Muster logistics throughput per minute; shown in the tooltip only. */
  logisticsPerMinute: number;
  nextRefillAtMs: number | undefined;
  nowMs: number;
  formatAmount: (value: number) => string;
};

const percent = (value: number, cap: number): number => (cap <= 0 ? 0 : Math.max(0, Math.min(100, (value / cap) * 100)));

const stateClass = (manpower: number, cap: number): string =>
  manpower > cap + 0.001 ? "is-overflow" : manpower + 0.001 >= cap ? "is-full" : manpower < ATTACK_MANPOWER_MIN ? "is-low" : "";

// Long form for wide desktops, short form where the chip is compact (narrow
// desktops and phones); both are rendered and CSS shows one (same for the
// label), so the choice follows the real viewport width rather than a
// render-time guess.
type RefillText = { long: string; short: string; quiet: boolean };

const refillText = (input: ManpowerGaugeInput): RefillText => {
  const { manpower, manpowerCap } = input;
  if (manpower > manpowerCap + 0.001) {
    const over = `+${input.formatAmount(manpower - manpowerCap)}`;
    return { long: `${over} over cap`, short: over, quiet: false };
  }
  if (manpower + 0.001 >= manpowerCap) return { long: "Full", short: "Full", quiet: true };
  if (input.regenPerMinute <= 0) return { long: "Paused", short: "Paused", quiet: true };
  if (input.nextRefillAtMs === undefined) return { long: "", short: "", quiet: true };
  const remaining = input.nextRefillAtMs - input.nowMs;
  if (remaining <= 0) return { long: "Refilling…", short: "now", quiet: false };
  const eta = formatRefillCountdown(remaining);
  return { long: `Refill in ${eta}`, short: eta, quiet: false };
};

export const manpowerGaugeChipHtml = (input: ManpowerGaugeInput): string => {
  const { manpower, manpowerCap, formatAmount } = input;
  const availablePct = percent(Math.min(manpower, manpowerCap), manpowerCap);
  const stagedPct = Math.min(percent(input.staged, manpowerCap), 100 - availablePct);
  const refill = refillText(input);
  const windowHours = MANPOWER_REFILL_WINDOW_MS / 3_600_000;
  const logistics = input.logisticsPerMinute > 0 ? ` Muster logistics throughput: ${input.logisticsPerMinute.toFixed(1)}/min.` : "";
  const staged = input.staged > 0 ? ` ${formatAmount(input.staged)} is staged in muster flags.` : "";
  const title = `Manpower gates attacks and refills every ${windowHours}h.${staged}${logistics} Tap for cap and regen breakdown.`;
  return `<button class="stat-chip stat-chip-manpower mp-gauge ${stateClass(manpower, manpowerCap)}" type="button" data-panel="manpower" title="${title}">
      <b class="mp-gauge-row"><b class="mp-gauge-label"><b class="mp-gauge-label-long">Manpower</b><b class="mp-gauge-label-short">MP</b></b><i class="mp-gauge-refill${refill.quiet ? " is-quiet" : ""}"><i class="mp-gauge-refill-long">${refill.long}</i><i class="mp-gauge-refill-short">${refill.short}</i></i></b>
      <b class="mp-gauge-row">
        <b class="mp-gauge-value">${formatAmount(manpower)}<small>/${formatAmount(manpowerCap)}</small></b>
        <i class="mp-gauge-track"><i class="mp-gauge-bar" role="meter" aria-label="Manpower" aria-valuemin="0" aria-valuemax="${Math.round(manpowerCap)}" aria-valuenow="${Math.round(manpower)}">
          <i class="mp-gauge-fill" style="width:${availablePct.toFixed(2)}%"></i>
          <i class="mp-gauge-staged" style="left:${availablePct.toFixed(2)}%;width:${stagedPct.toFixed(2)}%"></i>
        </i></i>
      </b>
    </button>`;
};

/**
 * Sum of manpower staged in the player's own muster flags. Scans the loaded
 * tiles, so the result is cached for a second: the HUD can re-render far more
 * often than a flag's amount meaningfully changes.
 */
let stagedCache: { at: number; me: string; value: number } | undefined;

export const ownStagedManpower = (
  tiles: Iterable<{ muster?: { ownerId: string; amount: number } | undefined }>,
  me: string,
  nowMs: number
): number => {
  if (stagedCache && stagedCache.me === me && nowMs - stagedCache.at < 1_000) return stagedCache.value;
  let value = 0;
  for (const tile of tiles) if (tile.muster && tile.muster.ownerId === me) value += tile.muster.amount;
  stagedCache = { at: nowMs, me, value };
  return value;
};

/** Test hook: forget the cached staged total. */
export const resetOwnStagedManpowerCache = (): void => {
  stagedCache = undefined;
};
