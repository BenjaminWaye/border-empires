/**
 * The one coin-income breakdown every surface reads.
 *
 * The simulation's economy snapshot is the authority: `incomePerMinute` is
 * exactly what passive accrual credits, and `economyBreakdown.GOLD.sources`
 * itemises it — including the Empire Integrity bonus/penalty and AFC Envoy
 * income as their own lines. This module turns that wire data into display
 * lines whose sum is, by construction, the headline: if the lines and the
 * authoritative total ever disagree (an older server, or a partial update),
 * the gap is shown as its own "Other" line instead of being silently hidden.
 */

/** Label of the GOLD source row carrying the Empire Integrity income effect (may be negative). */
export const EMPIRE_INTEGRITY_INCOME_LABEL = "Empire Integrity";
/** Label of the reconciling row shown when the itemised lines don't add up to the total. */
export const UNITEMISED_COIN_INCOME_LABEL = "Other";
/** Gaps below this (coin/minute, ~0.04/day — under the 0.05/day display rounding) are rounding noise. */
export const COIN_INCOME_EPSILON_PER_MINUTE = 3e-5;
export const MINUTES_PER_DAY = 1440;

export type CoinIncomeBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: string;
  note?: string;
};

export type CoinIncomeLine = CoinIncomeBucket & {
  /** "bonus" for empire-wide multipliers (Integrity), "other" for the reconciling gap. */
  kind: "source" | "bonus" | "other";
};

export type CoinIncomeBreakdown = {
  /** Earned lines; their amounts sum to grossPerMinute. */
  earned: CoinIncomeLine[];
  /** Coin upkeep lines; their amounts sum to upkeepPerMinute. */
  upkeep: CoinIncomeBucket[];
  grossPerMinute: number;
  upkeepPerMinute: number;
  /** grossPerMinute - upkeepPerMinute: the headline every surface shows. */
  netPerMinute: number;
  /** The Integrity line's amount (0 when there is none). */
  integrityPerMinute: number;
};

export type CoinIncomeInput = {
  /** Authoritative gross income (what accrual credits), before coin upkeep. */
  incomePerMinute: number;
  /** Authoritative coin upkeep per minute. */
  upkeepGoldPerMinute: number;
  /** Server GOLD source rows; undefined before the first full economy update. */
  sources?: readonly CoinIncomeBucket[] | undefined;
  /** Server GOLD sink rows. */
  sinks?: readonly CoinIncomeBucket[] | undefined;
  /** Label for the single line shown when there are no source rows yet. */
  fallbackLabel?: string;
};

const finite = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const sum = (rows: readonly { amountPerMinute: number }[]): number =>
  rows.reduce((total, row) => total + finite(row.amountPerMinute), 0);

/** Lines for `rows` plus, when they fall short of (or exceed) `total`, one reconciling line. */
const reconcile = <T extends CoinIncomeBucket>(rows: T[], total: number, makeGap: (gap: number) => T): T[] => {
  const gap = total - sum(rows);
  return Math.abs(gap) > COIN_INCOME_EPSILON_PER_MINUTE ? [...rows, makeGap(gap)] : rows;
};

const isCoinUpkeep = (row: CoinIncomeBucket): boolean => !row.resourceKey || row.resourceKey === "GOLD";

export const coinIncomeBreakdown = (input: CoinIncomeInput): CoinIncomeBreakdown => {
  const grossPerMinute = finite(input.incomePerMinute);
  const upkeepPerMinute = finite(input.upkeepGoldPerMinute);
  // Zero rows stay: a paused source ("Towns ×7, paused until…") is worth seeing and adds nothing.
  const rows = (input.sources ?? []).filter((row) => Number.isFinite(row.amountPerMinute));
  const lines: CoinIncomeLine[] = rows.map((row) => ({
    ...row,
    kind: row.label === EMPIRE_INTEGRITY_INCOME_LABEL ? "bonus" : "source"
  }));
  // The Integrity effect reads as a modifier on everything above it, so it goes last.
  const ordered = [...lines.filter((l) => l.kind !== "bonus"), ...lines.filter((l) => l.kind === "bonus")];
  const fallbackLabel = rows.length === 0 && input.fallbackLabel ? input.fallbackLabel : UNITEMISED_COIN_INCOME_LABEL;
  const earned = reconcile<CoinIncomeLine>(ordered, grossPerMinute, (gap) => ({ label: fallbackLabel, amountPerMinute: gap, count: 1, kind: "other" }));
  const coinSinks = (input.sinks ?? []).filter((row) => isCoinUpkeep(row) && Number.isFinite(row.amountPerMinute));
  const upkeep = reconcile([...coinSinks], upkeepPerMinute, (gap) => ({ label: UNITEMISED_COIN_INCOME_LABEL, amountPerMinute: gap, count: 1 }));
  return {
    earned,
    upkeep,
    grossPerMinute,
    upkeepPerMinute,
    netPerMinute: grossPerMinute - upkeepPerMinute,
    integrityPerMinute: finite(lines.find((l) => l.kind === "bonus")?.amountPerMinute)
  };
};

export const coinPerDay = (perMinute: number): number => finite(perMinute) * MINUTES_PER_DAY;

/** "+36.4/day" / "−2.0/day": the one coin-rate format. */
export const formatCoinPerDay = (perMinute: number): string => {
  const perDay = coinPerDay(perMinute);
  return `${perDay >= 0 ? "+" : "−"}${Math.abs(perDay).toFixed(1)}/day`;
};
