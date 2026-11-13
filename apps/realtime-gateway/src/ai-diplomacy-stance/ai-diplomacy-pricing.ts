// What an AI wants for a truce or alliance with one player, Civ-style. Prices
// are hours of the AI's own income: a poor AI asks little whoever is buying,
// so a strong economy can buy off weak neighbours cheaply. A truce costs:
//   - nothing between empires whose borders don't meet and who aren't fighting
//   - 12h between neighbours at peace, 24h at war, 48h if the AI is winning
//   - plus 1h per tile the player recently took from the AI (reparations)
//   - scaled by attitude, and up 50% for every truce the player bought recently
//   - minus the base price entirely when the AI is desperate (armies spent, starving)
//   - up 50% within 30 min of the player attacking (fresh aggression). In that
//     window the AI only refuses outright when it has a counter-attack ready
//     and the border is worth it (ai-retaliation-readiness.ts), and it never
//     pays for peace with someone who just attacked it.
// The AI's temperament (ai-diplomacy-temperament.ts) scales the base price,
// reparations and what it pays for peace.
// An AI that is losing a war will pay for peace instead (the loser pays),
// but only once per war and never more than a quarter of its coin. An AI
// suing for peace (ai-war-outlook.ts: losing ground fast with no reload that
// could stop it) pays even right after being attacked, and pays for the land
// it expects to lose -- an hour of income a tile, up to 12h and 40% of its coin. Losing
// also overrides fury: an AI that hates you still wants a war it is losing
// over -- unless you broke a truce with it, which it never deals past.
// Alliances need an AI that is at least Pleased, hasn't fought the player for
// a day, and -- when the resulting bloc would hold 40%+ of the world's land --
// would be its largest member (Diplomatic Dominance victory goes to the bloc's
// largest member); the AI never pays to
// join one. An AI below Pleased that payments could still win over (the
// goodwill cap allows it) asks tribute instead of refusing: the coin that
// lifts it to Pleased -- deal payments count as goodwill once accepted --
// plus its Pleased alliance price.
import { GOODWILL_POINTS_PER_INCOME_HOUR, type AiDiplomacyPricing, type DiplomacyGoods } from "@border-empires/shared";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { ATTITUDE_RANK, type AiAttitude, type AiOpinion } from "./ai-diplomacy-opinion.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";
import { AI_TEMPERAMENTS, type AiTemperament } from "./ai-diplomacy-temperament.js";
import type { AiRetaliationReadiness } from "./ai-retaliation-readiness.js";
import type { AiWarOutlook } from "./ai-war-outlook.js";

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
/** The same caps for an AI suing for peace: it pays for the land it expects to lose, within these. */
export const AI_SUING_MAX_PAYMENT_HOURS = 12;
export const AI_SUING_COIN_SHARE = 0.4;
/** The "fresh aggression" window after the player attacks: surcharged, refused when the AI can strike back. */
export const TRUCE_COOLDOWN_AFTER_ATTACK_MS = 30 * 60_000;
export const FRESH_ATTACK_SURCHARGE = 0.5;
export const ALLIANCE_NO_FIGHTING_MS = 24 * 60 * 60_000;
export const ALLIANCE_HOURS: Partial<Record<AiAttitude, number>> = { PLEASED: 24, FRIENDLY: 0 };

/** Income floor so prices never collapse to zero: 10 coin a day, in coin/min. */
export const MIN_INCOME_PER_MINUTE = 10 / (24 * 60);
/**
 * Least coin one goodwill point costs. A point is 10 minutes of the AI's
 * income, which on the price floor would be under a tenth of a coin: capped
 * goodwill, and so a free alliance, for 2 coin at season start.
 */
export const MIN_COIN_PER_GOODWILL_POINT = 2;

/**
 * What "an hour of income" means for goodwill: the AI's own, divided by its
 * temperament's gift value, so a point costs at least MIN_COIN_PER_GOODWILL_POINT
 * even for a Merchant.
 */
export const goodwillIncomePerHour = (aiIncomePerMinute: number, giftValue = 1): number =>
  Math.max(MIN_COIN_PER_GOODWILL_POINT * GOODWILL_POINTS_PER_INCOME_HOUR, ((Number.isFinite(aiIncomePerMinute) ? aiIncomePerMinute : 0) * 60) / giftValue);

export type AiDiplomacyPricingResult = {
  pricing: AiDiplomacyPricing;
  /** Why a truce is off the table, when it is. */
  truceRefusal?: string;
  allianceRefusal?: string;
};

/** Inside the fresh-aggression window: refuse only with a counter-attack ready on a border worth fighting for. */
const strikesBack = (retaliation: AiRetaliationReadiness | undefined, aiWinning: boolean): boolean =>
  retaliation === undefined || (retaliation.ready && (retaliation.boxedIn || aiWinning));

export const aiDiplomacyPricing = (input: {
  aiName: string;
  stanceKind: AiDiplomacyStanceKind;
  opinion: AiOpinion;
  memory: DiplomacyMemoryView;
  bordersTouch: boolean;
  aiIncomePerMinute: number;
  aiHoldings: DiplomacyGoods;
  requesterBrokeTruceWithAi: boolean;
  /** Diplomatic Dominance goes to a bloc's largest member: the AI only joins blocs it would lead. undefined: sizes unknown right now. */
  aiWouldLeadAlliance: boolean | undefined;
  /**
   * Coin of goodwill that would lift the AI to Pleased (shared giftToReach), or
   * undefined when the goodwill cap stops payments from getting there.
   */
  giftToPleased?: number;
  /** Diplomatic Corps (AFC Chancery II): multiplier on what the requester pays for a truce. */
  requesterTruceCostMult?: number;
  /** Whether the AI could hit back right now. undefined: unknown, so it refuses inside the window as before. */
  retaliation?: AiRetaliationReadiness;
  /** The AI's fixed personality (ai-diplomacy-temperament.ts); Measured when omitted. */
  temperament?: AiTemperament;
  /** The AI's read on the next couple of hours of war; STEADY when omitted. */
  outlook?: AiWarOutlook;
  now: number;
}): AiDiplomacyPricingResult => {
  const temperament = input.temperament ?? AI_TEMPERAMENTS.MEASURED;
  const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
  const aiIncome = Math.max(MIN_INCOME_PER_MINUTE, finite(input.aiIncomePerMinute));
  const hoursToCoin = (hours: number, perMinute: number): number => Math.round(hours * 60 * perMinute);
  const { opinion, memory, aiName } = input;
  const { war } = opinion;
  const aiHoldings = { ...(input.aiHoldings.resources ? { resources: input.aiHoldings.resources } : {}), gold: Math.max(0, Math.floor(input.aiHoldings.gold)) };

  // --- truce ---
  let truceRefusal: string | undefined;
  const minutesSinceAttack = memory.lastPlayerAttackAt === undefined ? undefined : (input.now - memory.lastPlayerAttackAt) / 60_000;
  // Betrayal is the one grudge losing doesn't soften: no paying a truce-breaker for a truce it can break again.
  const furyHolds = !war.aiLosing || input.requesterBrokeTruceWithAi;
  const freshAttack = minutesSinceAttack !== undefined && minutesSinceAttack * 60_000 < TRUCE_COOLDOWN_AFTER_ATTACK_MS;
  if (opinion.attitude === "FURIOUS" && furyHolds) truceRefusal = `${aiName} is furious with you and won't talk peace.`;
  else if (freshAttack && minutesSinceAttack !== undefined && strikesBack(input.retaliation, war.aiWinning)) {
    const minutesLeft = Math.max(1, Math.ceil(TRUCE_COOLDOWN_AFTER_ATTACK_MS / 60_000 - minutesSinceAttack));
    truceRefusal = input.retaliation
      ? `You attacked ${aiName} ${Math.max(1, Math.round(minutesSinceAttack))} min ago and they have an army ready to strike back. They won't talk peace for another ${minutesLeft} min.`
      : `You attacked ${aiName} ${Math.max(1, Math.round(minutesSinceAttack))} min ago. They won't talk peace yet.`;
  }
  let truce12: number | null = null;
  let truce24: number | null = null;
  if (!truceRefusal) {
    const suing = input.outlook?.kind === "SUE_FOR_PEACE" ? input.outlook : undefined;
    if (war.aiLosing && !memory.aiAlreadyPaidThisWar && (!freshAttack || suing)) {
      // The loser pays: offer up to a capped sum to end a war it is losing.
      // Being overrun, it pays for the land it would otherwise lose.
      const hours = suing
        ? Math.min(AI_SUING_MAX_PAYMENT_HOURS, Math.max(AI_PEACE_PAYMENT_HOURS, suing.projectedLoss * REPARATION_HOURS_PER_TILE))
        : AI_PEACE_PAYMENT_HOURS;
      const payment = Math.min(
        hoursToCoin(hours * temperament.peacePayment, aiIncome),
        Math.floor(aiHoldings.gold * (suing ? AI_SUING_COIN_SHARE : AI_PEACE_PAYMENT_COIN_SHARE) * temperament.peacePayment)
      );
      truce12 = -payment;
      truce24 = -payment;
    } else if (war.aiLosing) {
      // A losing AI fresh from an attack still wants the war over, but the attacker pays for the ground it took.
      const reparationHours = freshAttack ? memory.tilesTakenFromAi * REPARATION_HOURS_PER_TILE * temperament.tileGrudge * (input.requesterTruceCostMult ?? 1) : 0;
      truce12 = hoursToCoin(reparationHours, aiIncome);
      truce24 = hoursToCoin(reparationHours * LONG_TRUCE_MULTIPLIER, aiIncome);
    } else {
      const baseHours = war.atWar
        ? war.aiWinning ? TRUCE_HOURS.aiWinning : TRUCE_HOURS.atWar
        : input.bordersTouch ? TRUCE_HOURS.neighboursAtPeace : TRUCE_HOURS.apartAtPeace;
      const reparationHours = memory.tilesTakenFromAi * REPARATION_HOURS_PER_TILE * temperament.tileGrudge;
      const desperation = input.stanceKind === "SEEKING_PEACE" ? DESPERATE_DISCOUNT : 1;
      const repeat = 1 + REPEAT_TRUCE_SURCHARGE * memory.truceDeals;
      const fresh = freshAttack ? 1 + FRESH_ATTACK_SURCHARGE : 1;
      const hours = (baseHours * temperament.trucePrice * ATTITUDE_PRICE_MULTIPLIER[opinion.attitude] * desperation + reparationHours) * repeat * fresh;
      const corps = input.requesterTruceCostMult ?? 1;
      truce12 = hoursToCoin(hours * corps, aiIncome);
      truce24 = hoursToCoin(hours * LONG_TRUCE_MULTIPLIER * corps, aiIncome);
    }
  }

  // --- alliance ---
  let allianceRefusal: string | undefined;
  const foughtRecently = memory.lastCombatAt !== undefined && input.now - memory.lastCombatAt < ALLIANCE_NO_FIGHTING_MS;
  // Below Pleased, tribute that wins the AI over stands in for the attitude it lacks.
  const belowPleased = ATTITUDE_RANK[opinion.attitude] < ATTITUDE_RANK.PLEASED;
  const tribute = belowPleased && input.giftToPleased !== undefined ? Math.max(0, Math.ceil(input.giftToPleased)) : undefined;
  // Refusals that don't depend on bloc sizes come first, so the player hears the real reason.
  if (input.requesterBrokeTruceWithAi) allianceRefusal = `${aiName} will never ally with someone who broke a truce with them.`;
  else if (foughtRecently) allianceRefusal = `${aiName} won't ally with an empire it fought within the last day.`;
  else if (belowPleased && tribute === undefined) allianceRefusal = `${aiName} doesn't think well enough of you for an alliance.`;
  else if (input.aiWouldLeadAlliance === undefined) allianceRefusal = `${aiName} can't weigh up an alliance right now. Try again shortly.`;
  else if (!input.aiWouldLeadAlliance) allianceRefusal = `${aiName} won't join an alliance this large unless it clearly leads it: it won't help anyone else toward Diplomatic Dominance.`;
  const allianceHours = allianceRefusal ? undefined : tribute !== undefined ? ALLIANCE_HOURS.PLEASED : ALLIANCE_HOURS[opinion.attitude];
  const alliance = allianceHours === undefined ? null : hoursToCoin(allianceHours, aiIncome) + (tribute ?? 0);

  return {
    pricing: { required: { truce12, truce24, alliance }, aiHoldings },
    ...(truceRefusal ? { truceRefusal } : {}),
    ...(allianceRefusal ? { allianceRefusal } : {})
  };
};
