// The client's only readers of coin income. Every surface that shows an
// empire coin rate (top bar, Economy panel, Integrity panel) goes through
// empireCoinIncome, and every surface that shows one tile's or town's coin
// rate (Towns lists, town screen, tile sheet, tile facts, map labels) goes
// through tileCoinPerMinute — so two screens can never compute the same
// number two different ways.
import { coinIncomeBreakdown, type CoinIncomeBreakdown } from "@border-empires/shared";
import { STRUCTURE_DISPLAY_NAMES } from "../client-structure-display-names.js";
import type { EconomyBreakdown, EconomyBucket } from "../client-economy-model.js";
import { deriveTileYieldRate } from "../yield-derivation/yield-derivation.js";
import type { Tile } from "../client-types.js";

export type EmpireCoinIncomeInput = {
  incomePerMinute: number;
  upkeepPerMinute: { gold: number };
  economyBreakdown: EconomyBreakdown | undefined;
};

/** Shown as the single earned line before the first detailed breakdown arrives. */
export const LIVE_EMPIRE_INCOME_LABEL = "Live empire income";

// The server labels a structure-driven bucket (e.g. a converter's EXCHANGE-mode
// gold) with the raw structure type; show its display name instead. Other
// labels ("Towns", "Docks", "Empire Integrity", ...) pass through unchanged.
const displayName = (label: string): string =>
  label in STRUCTURE_DISPLAY_NAMES ? STRUCTURE_DISPLAY_NAMES[label as keyof typeof STRUCTURE_DISPLAY_NAMES] ?? label : label;

const withDisplayNames = (rows: readonly EconomyBucket[] | undefined): EconomyBucket[] | undefined =>
  rows?.map((row) => ({ ...row, label: displayName(row.label) }));

/** The empire's coin income: headline (net) plus the earned and upkeep lines that sum to it. */
export const empireCoinIncome = (input: EmpireCoinIncomeInput): CoinIncomeBreakdown =>
  coinIncomeBreakdown({
    incomePerMinute: input.incomePerMinute,
    upkeepGoldPerMinute: input.upkeepPerMinute.gold,
    sources: withDisplayNames(input.economyBreakdown?.GOLD.sources),
    sinks: withDisplayNames(input.economyBreakdown?.GOLD.sinks),
    fallbackLabel: LIVE_EMPIRE_INCOME_LABEL
  });

const finiteOrZero = (value: number | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * One tile's (or its town's) coin per minute, before the empire-wide
 * Integrity effect (which is its own line in empireCoinIncome).
 *
 * Towns: the town summary's goldPerMinute (sabotage and the settlement
 * fallback applied) is fresher than a cached yieldRate, which can be the 0 a
 * tile-detail reply sent before the town was garrisoned or fed — and a known
 * 0 (an unfed town) stays 0 instead of falling back to that cache. Docks keep
 * the server's yieldRate: only it knows their link bonuses.
 */
export const tileCoinPerMinute = (tile: Pick<Tile, "town" | "dockId" | "yieldRate" | "sabotage">): number => {
  if (tile.dockId && tile.yieldRate) return finiteOrZero(tile.yieldRate.goldPerMinute);
  const derived = deriveTileYieldRate(tile);
  if (derived) return derived.goldPerMinute;
  if (tile.town && typeof tile.town.goldPerMinute === "number" && Number.isFinite(tile.town.goldPerMinute)) return 0;
  return finiteOrZero(tile.yieldRate?.goldPerMinute);
};
