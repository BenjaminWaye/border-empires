// What an AI wants for a truce or alliance with one player, Civ-style. Prices
// are hours of income, and "income" is the richer of the two empires so a
// poor AI can't be bought cheaply by a rich player. A truce costs:
//   - nothing between empires whose borders don't meet and who aren't fighting
//   - 12h between neighbours at peace, 24h at war, 48h if the AI is winning
//   - plus 1h per tile the player recently took from the AI (reparations)
//   - scaled by attitude, and up 50% for every truce the player bought recently
//   - minus the base price entirely when the AI is desperate (armies spent, starving)
// An AI that is losing a war will pay for peace instead (the loser pays),
// but only once per war and never more than a quarter of its coin.
// Alliances need an AI that is at least Pleased, hasn't fought the player for
// a day, and would be the largest member of the resulting bloc (Diplomatic
// Dominance victory goes to the bloc's largest member); the AI never pays to
// join one.
import { SHARD_COIN_VALUE, type AiDiplomacyPricing, type DiplomacyGoods } from "@border-empires/shared";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { ATTITUDE_RANK, type AiAttitude, type AiOpinion } from "./ai-diplomacy-opinion.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";

export const TRUCE_HOURS = { apartAtPeace: 0, neighboursAtPeace: 12, atWar: 24, aiWinning: 48 } as const;
export const REPARATION_HOURS_PER_TILE = 1;
export const REPEAT_TRUCE_SURCHARGE = 0.5;
export const LONG_TRUCE_MULTIPLIER = 1.5;
export const ATTITUDE_PRICE_MULTIPLIER: Record<AiAttitude, number> = { FURIOUS: 2, ANNOYED: 1.5, CAUTIOUS: 1, PLEASED: 0.75, FRIENDLY: 0.5 };
/** A desperate AI (armies spent, food running out) takes peace for free; only reparations remain. */
export const DESPERATE_DISCOUNT = 0;
/** Most a losing AI pays for peace: hours of its own income, and share of its coin. */
export const AI_PEACE_PAYMENT_HOURS = 6;
export const AI_PEACE_PAYMENT_COIN_SHARE = 0.25;
/** No peace talks this soon after the player attacks (Civ's "too soon after declaring war"). */
export const TRUCE_COOLDOWN_AFTER_ATTACK_MS = 30 * 60_000;
export const ALLIANCE_NO_FIGHTING_MS = 24 * 60 * 60_000;
export const ALLIANCE_HOURS: Partial<Record<AiAttitude, number>> = { PLEASED: 24, FRIENDLY: 0 };

/** Income floor (coin/min) so prices never collapse to zero. */
const MIN_INCOME_PER_MINUTE = 1;

export type AiDiplomacyPricingResult = {
  pricing: AiDiplomacyPricing;
  /** Why a truce is off the table, when it is. */
  truceRefusal?: string;
  allianceRefusal?: string;
};

export const aiDiplomacyPricing = (input: {
  aiName: string;
  stanceKind: AiDiplomacyStanceKind;
  opinion: AiOpinion;
  memory: DiplomacyMemoryView;
  bordersTouch: boolean;
  aiIncomePerMinute: number;
  requesterIncomePerMinute: number;
  aiHoldings: DiplomacyGoods;
  requesterBrokeTruceWithAi: boolean;
  /** Diplomatic Dominance goes to a bloc's largest member: the AI only joins blocs it would lead. */
  aiWouldLeadAlliance: boolean;
  now: number;
}): AiDiplomacyPricingResult => {
  const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
  const aiIncome = Math.max(MIN_INCOME_PER_MINUTE, finite(input.aiIncomePerMinute));
  const priceIncome = Math.max(aiIncome, finite(input.requesterIncomePerMinute));
  const hoursToCoin = (hours: number, perMinute: number): number => Math.round(hours * 60 * perMinute);
  const { opinion, memory, aiName } = input;
  const { war } = opinion;
  const aiHoldings = { gold: Math.max(0, Math.floor(input.aiHoldings.gold)), shard: Math.max(0, Math.floor(input.aiHoldings.shard)) };

  // --- truce ---
  let truceRefusal: string | undefined;
  const minutesSinceAttack = memory.lastPlayerAttackAt === undefined ? undefined : (input.now - memory.lastPlayerAttackAt) / 60_000;
  if (opinion.attitude === "FURIOUS") truceRefusal = `${aiName} is furious with you and won't talk peace.`;
  else if (minutesSinceAttack !== undefined && minutesSinceAttack * 60_000 < TRUCE_COOLDOWN_AFTER_ATTACK_MS) {
    truceRefusal = `You attacked ${aiName} ${Math.max(1, Math.round(minutesSinceAttack))} min ago. They won't talk peace yet.`;
  }
  let truce12: number | null = null;
  let truce24: number | null = null;
  if (!truceRefusal) {
    if (war.aiLosing && !memory.aiAlreadyPaidThisWar) {
      // The loser pays: offer up to a capped sum to end a war it is losing.
      const payment = Math.min(hoursToCoin(AI_PEACE_PAYMENT_HOURS, aiIncome), Math.floor(aiHoldings.gold * AI_PEACE_PAYMENT_COIN_SHARE));
      truce12 = -payment;
      truce24 = -payment;
    } else if (war.aiLosing) {
      truce12 = 0;
      truce24 = 0;
    } else {
      const baseHours = war.atWar
        ? war.aiWinning ? TRUCE_HOURS.aiWinning : TRUCE_HOURS.atWar
        : input.bordersTouch ? TRUCE_HOURS.neighboursAtPeace : TRUCE_HOURS.apartAtPeace;
      const reparationHours = memory.tilesTakenFromAi * REPARATION_HOURS_PER_TILE;
      const desperation = input.stanceKind === "SEEKING_PEACE" ? DESPERATE_DISCOUNT : 1;
      const repeat = 1 + REPEAT_TRUCE_SURCHARGE * memory.truceDeals;
      const hours = (baseHours * ATTITUDE_PRICE_MULTIPLIER[opinion.attitude] * desperation + reparationHours) * repeat;
      truce12 = hoursToCoin(hours, priceIncome);
      truce24 = hoursToCoin(hours * LONG_TRUCE_MULTIPLIER, priceIncome);
    }
  }

  // --- alliance ---
  let allianceRefusal: string | undefined;
  const foughtRecently = memory.lastCombatAt !== undefined && input.now - memory.lastCombatAt < ALLIANCE_NO_FIGHTING_MS;
  if (input.requesterBrokeTruceWithAi) allianceRefusal = `${aiName} will never ally with someone who broke a truce with them.`;
  else if (!input.aiWouldLeadAlliance) allianceRefusal = `${aiName} won't join an alliance it wouldn't lead: your alliance is too large.`;
  else if (foughtRecently) allianceRefusal = `${aiName} won't ally with an empire it fought within the last day.`;
  else if (ATTITUDE_RANK[opinion.attitude] < ATTITUDE_RANK.PLEASED) allianceRefusal = `${aiName} doesn't think well enough of you for an alliance.`;
  const allianceHours = allianceRefusal ? undefined : ALLIANCE_HOURS[opinion.attitude];
  const alliance = allianceHours === undefined ? null : hoursToCoin(allianceHours, priceIncome);

  return {
    pricing: { required: { truce12, truce24, alliance }, shardCoinValue: SHARD_COIN_VALUE, aiHoldings },
    ...(truceRefusal ? { truceRefusal } : {}),
    ...(allianceRefusal ? { allianceRefusal } : {})
  };
};
