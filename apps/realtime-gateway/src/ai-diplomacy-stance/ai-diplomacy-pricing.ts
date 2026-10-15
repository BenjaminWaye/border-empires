// What an AI wants (or would pay) for a truce or alliance, by stance. Prices
// are hours of the AI's own income so they scale over a season. A truce is
// meant to be a real cost: even a merely wary AI wants a full day's income.
import { SHARD_COIN_VALUE, type AiDiplomacyPricing, type DiplomacyGoods } from "@border-empires/shared";

import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

type HoursOfIncome = { truce12: number | null; truce24: number | null; alliance: number | null };

/** Positive: the AI must be paid this much. Negative: the AI would pay up to this much. null: refuses at any price. */
export const AI_DIPLOMACY_PRICE_HOURS: Record<AiDiplomacyStanceKind, HoursOfIncome> = {
  DISTRUSTFUL: { truce12: null, truce24: null, alliance: null },
  WINNING: { truce12: 72, truce24: 108, alliance: null },
  WARY: { truce12: 24, truce24: 36, alliance: 72 },
  INDIFFERENT: { truce12: 0, truce24: 0, alliance: 36 },
  OUTMATCHED: { truce12: -12, truce24: -12, alliance: 0 },
  SEEKING_PEACE: { truce12: -18, truce24: -18, alliance: 36 }
};

/** Income floor so a broke AI's prices don't collapse to zero. */
const MIN_INCOME_PER_MINUTE = 1;

export const aiDiplomacyPricing = (input: {
  stanceKind: AiDiplomacyStanceKind;
  /** A desperate AI allies freely with an equal or stronger player (stance.acceptsAlliance). */
  acceptsAllianceFree: boolean;
  incomePerMinute: number;
  aiHoldings: DiplomacyGoods;
}): AiDiplomacyPricing => {
  const income = Math.max(MIN_INCOME_PER_MINUTE, Number.isFinite(input.incomePerMinute) ? input.incomePerMinute : 0);
  const hours = AI_DIPLOMACY_PRICE_HOURS[input.stanceKind];
  const price = (value: number | null): number | null => (value === null ? null : Math.round(value * 60 * income));
  const allianceHours = input.stanceKind === "SEEKING_PEACE" && input.acceptsAllianceFree ? 0 : hours.alliance;
  return {
    required: { truce12: price(hours.truce12), truce24: price(hours.truce24), alliance: price(allianceHours) },
    shardCoinValue: SHARD_COIN_VALUE,
    aiHoldings: { gold: Math.max(0, Math.floor(input.aiHoldings.gold)), shard: Math.max(0, Math.floor(input.aiHoldings.shard)) }
  };
};
