// Gifts: coin or Shards given to an AI for nothing but its goodwill. An AI's
// attitude is a sum of opinion modifiers (apps/realtime-gateway
// ai-diplomacy-opinion.ts); gifts and deal payments add one, "Gifts and
// payments you've made us", worth GOODWILL_POINTS_PER_INCOME_HOUR per hour
// of income paid and capped at MAX_GOODWILL_POINTS, so gifts can win over a
// wary AI but can't buy friendship outright. Shared so the trade screen's
// "+N opinion" preview and the gateway's real opinion use the same arithmetic.

export type AiAttitudeLevel = "FURIOUS" | "ANNOYED" | "CAUTIOUS" | "PLEASED" | "FRIENDLY";

/** Goodwill points per hour of income paid to the AI, and the cap: payments can't buy friendship outright. */
export const GOODWILL_POINTS_PER_INCOME_HOUR = 6;
export const MAX_GOODWILL_POINTS = 25;

/** Lowest opinion score for the attitudes a gift can aim for; an alliance needs Pleased. */
export const ATTITUDE_MIN_SCORE = { PLEASED: 10, FRIENDLY: 25 } as const;

export const attitudeForScore = (score: number): AiAttitudeLevel =>
  score <= -40
    ? "FURIOUS"
    : score <= -15
      ? "ANNOYED"
      : score < ATTITUDE_MIN_SCORE.PLEASED
        ? "CAUTIOUS"
        : score < ATTITUDE_MIN_SCORE.FRIENDLY
          ? "PLEASED"
          : "FRIENDLY";

/** Unrounded goodwill points for coin paid, where `incomePerHour` is what "one hour of income" means. */
export const goodwillPointsFor = (goodwillCoin: number, incomePerHour: number): number =>
  incomePerHour > 0 ? Math.min(MAX_GOODWILL_POINTS, (Math.max(0, goodwillCoin) / incomePerHour) * GOODWILL_POINTS_PER_INCOME_HOUR) : 0;

/** What the trade screen needs to preview a gift (the gateway's DIPLOMACY_STANCE reply). */
export type AiGiftView = {
  /** Coin-equivalent per goodwill point. */
  coinPerPoint: number;
  /** Goodwill points the requester already has with this AI, unrounded (they fade over a day). */
  goodwillPoints: number;
  maxPoints: number;
};

export const giftView = (goodwillCoin: number, incomePerHour: number): AiGiftView => ({
  coinPerPoint: incomePerHour / GOODWILL_POINTS_PER_INCOME_HOUR,
  goodwillPoints: goodwillPointsFor(goodwillCoin, incomePerHour),
  maxPoints: MAX_GOODWILL_POINTS
});

/** How much the opinion score rises for a gift worth `value` coin (modifiers are rounded, as the gateway rounds them). */
export const giftOpinionGain = (view: AiGiftView, value: number): number => {
  if (!(view.coinPerPoint > 0) || !(value > 0)) return 0;
  const after = Math.min(view.maxPoints, view.goodwillPoints + value / view.coinPerPoint);
  return Math.round(after) - Math.round(view.goodwillPoints);
};

/** Rounds coin up, ignoring float dust (96.00000000000001 is 96). */
const ceilCoin = (coin: number): number => Math.ceil(coin - 1e-9);

/** Coin past this adds no opinion: the goodwill cap is reached. */
export const giftCoinToCap = (view: AiGiftView): number => Math.max(0, ceilCoin((view.maxPoints - view.goodwillPoints) * view.coinPerPoint));

/**
 * The least coin that lifts the opinion score from `score` to `targetScore`,
 * or undefined when the goodwill cap stops gifts from getting there.
 */
export const giftToReach = (view: AiGiftView, score: number, targetScore: number): number | undefined => {
  const needed = targetScore - score;
  if (needed <= 0) return 0;
  if (!(view.coinPerPoint > 0)) return undefined;
  const targetPoints = Math.round(view.goodwillPoints) + needed;
  if (targetPoints > view.maxPoints) return undefined;
  // Math.round rounds .5 up, so targetPoints - 0.5 would just do; aim a little
  // higher so goodwill fading (or income moving) before the gift lands can't undo it.
  const coin = Math.max(1, ceilCoin((targetPoints - 0.4 - view.goodwillPoints) * view.coinPerPoint));
  // Guard float edges: step up until the rounded gain really arrives.
  return giftOpinionGain(view, coin) >= needed ? coin : coin + 1;
};
