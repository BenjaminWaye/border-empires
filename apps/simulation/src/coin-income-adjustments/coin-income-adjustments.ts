// Empire-wide coin income rows that sit on top of the per-tile sources
// (AFC Envoy income, the Empire Integrity effect). The live economy snapshot
// carries them as GOLD source rows; the cold login snapshot path rebuilds the
// per-tile rows itself, so it re-applies these from the exported player to
// keep its breakdown summing to the exported incomePerMinute.
import { EMPIRE_INTEGRITY_INCOME_LABEL } from "@border-empires/shared";
import { afcEnvoyIncomeInSnapshot } from "../afc-specializations/afc-coalition.js";

type GoldSourceRows = { economyBreakdown?: { GOLD: { sources: readonly { label: string; amountPerMinute: number }[] } } };

export type CoinIncomeAdjustments = {
  afcEnvoyIncomePerMinute: number;
  integrityIncomePerMinute: number;
};

export const integrityIncomeInSnapshot = (snapshot: GoldSourceRows): number =>
  snapshot.economyBreakdown?.GOLD.sources.find((row) => row.label === EMPIRE_INTEGRITY_INCOME_LABEL)?.amountPerMinute ?? 0;

export const coinIncomeAdjustmentsInSnapshot = (snapshot: GoldSourceRows): CoinIncomeAdjustments => ({
  afcEnvoyIncomePerMinute: afcEnvoyIncomeInSnapshot(snapshot),
  integrityIncomePerMinute: integrityIncomeInSnapshot(snapshot)
});

/** Adds the Integrity row (signed) and its amount to a snapshot built without it. */
export const applyIntegrityIncomeLine = <T extends { incomePerMinute: number; economyBreakdown: { GOLD: { sources: Array<{ label: string; amountPerMinute: number; count: number }> } } }>(
  snapshot: T,
  integrityPerMinute: number
): T => {
  if (!Number.isFinite(integrityPerMinute) || integrityPerMinute === 0) return snapshot;
  snapshot.incomePerMinute += integrityPerMinute;
  snapshot.economyBreakdown.GOLD.sources.push({ label: EMPIRE_INTEGRITY_INCOME_LABEL, amountPerMinute: integrityPerMinute, count: 1 });
  return snapshot;
};
