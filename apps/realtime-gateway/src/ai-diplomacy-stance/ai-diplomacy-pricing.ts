// What an AI wants (or would pay) for a truce or alliance, by stance. Prices
// are minutes of the AI's own income so they scale over a season: a 20-minute
// ask is small for a young empire and large for a late one. First guesses,
// meant to be tuned in play.
import { SHARD_COIN_VALUE, type AiDiplomacyPricing, type DiplomacyGoods } from "@border-empires/shared";

import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

type MinutesOfIncome = { truce12: number | null; truce24: number | null; alliance: number | null };

/** Positive: the AI must be paid this much. Negative: the AI would pay up to this much. null: refuses at any price. */
export const AI_DIPLOMACY_PRICE_MINUTES: Record<AiDiplomacyStanceKind, MinutesOfIncome> = {
  DISTRUSTFUL: { truce12: null, truce24: null, alliance: null },
  WINNING: { truce12: 60, truce24: 90, alliance: null },
  WARY: { truce12: 20, truce24: 30, alliance: 60 },
  INDIFFERENT: { truce12: 0, truce24: 0, alliance: 30 },
  OUTMATCHED: { truce12: -10, truce24: -10, alliance: 0 },
  SEEKING_PEACE: { truce12: -15, truce24: -15, alliance: 30 }
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
  const minutes = AI_DIPLOMACY_PRICE_MINUTES[input.stanceKind];
  const price = (value: number | null): number | null => (value === null ? null : Math.round(value * income));
  const allianceMinutes = input.stanceKind === "SEEKING_PEACE" && input.acceptsAllianceFree ? 0 : minutes.alliance;
  return {
    required: { truce12: price(minutes.truce12), truce24: price(minutes.truce24), alliance: price(allianceMinutes) },
    shardCoinValue: SHARD_COIN_VALUE,
    aiHoldings: { gold: Math.max(0, Math.floor(input.aiHoldings.gold)), shard: Math.max(0, Math.floor(input.aiHoldings.shard)) }
  };
};
