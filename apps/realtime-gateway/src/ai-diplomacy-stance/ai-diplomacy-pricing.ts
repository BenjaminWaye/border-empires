// What an AI wants for a truce or alliance with one player, Civ-style. Prices
// are hours of the AI's own income: a poor AI asks little whoever is buying,
// so a strong economy can buy off weak neighbours cheaply. A truce costs:
//   - 2h between empires where the player hasn't attacked the AI in the last day
//   - 12h for neighbours who attacked the AI in the last day, 24h at war, 48h if the AI is winning
//   - plus 1h per tile the player recently took from the AI (reparations)
//   - scaled by attitude, and up 50% for every truce the player bought recently
//     while taking the AI's land (peaceful renewals aren't surcharged)
//   - minus the base price when the AI is desperate and the requester is a neighbour or at war
//   - refused while the AI could still win back land it lost (ai-war-outlook.ts
//     RETAKE_NOW / HOLD_FOR_REFILL), so a land grab can't be locked in with a truce,
//     unless the deal hands back one of the towns the player took from it:
//     that is reparations, and the usual price applies (pricing.townReturn)
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
// lifts it to Pleased -- deal payments count as goodwill once accepted.
// Past that an alliance costs nothing: it is earned, not bought.
import { GOODWILL_POINTS_PER_INCOME_HOUR, type AiDiplomacyPricing, type DiplomacyGoods, type ReturnableTown } from "@border-empires/shared";

import type { DiplomacyMemoryView } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { ATTITUDE_RANK, type AiAttitude, type AiOpinion } from "./ai-diplomacy-opinion.js";
import type { AiDiplomacyStanceKind } from "./ai-diplomacy-stance.js";
import { AI_TEMPERAMENTS, type AiTemperament } from "./ai-diplomacy-temperament.js";
import type { AiRetaliationReadiness } from "./ai-retaliation-readiness.js";
import type { AiWarOutlook } from "./ai-war-outlook.js";
import { pricedReturnableTowns } from "./ai-town-return-value.js";

export const TRUCE_HOURS = { apartAtPeace: 2, neighboursAtPeace: 12, atWar: 24, aiWinning: 48 } as const;
export const REPARATION_HOURS_PER_TILE = 1;
export const REPEAT_TRUCE_SURCHARGE = 0.5;
export const LONG_TRUCE_MULTIPLIER = 1.5;
export const ATTITUDE_PRICE_MULTIPLIER: Record<AiAttitude, number> = { FURIOUS: 2, ANNOYED: 1.5, CAUTIOUS: 1, PLEASED: 0.75, FRIENDLY: 0.5 };
/** A desperate AI waives the base price for neighbours and opponents; reparations remain. */
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
/** How long after attacking an AI a neighbour still pays the 12h neighbour price instead of the 2h peace price. */
export const NEIGHBOUR_PRICE_WINDOW_MS = 24 * 60 * 60_000;
/** Alliances are earned, Civ VI-style: Pleased and a day without fighting, then free. Gifts lift attitude to Pleased. */
export const ALLIANCE_HOURS: Partial<Record<AiAttitude, number>> = { PLEASED: 0, FRIENDLY: 0 };

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
  /** Towns the requester holds that it could hand back (any empire's; only this AI's are priced). */
  returnableTowns?: readonly ReturnableTown[];
  /** This AI's id, to pick its own towns out of returnableTowns. */
  aiPlayerId?: string;
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
  // Land it can still win back isn't for sale: grabbing tiles and running dry
  // doesn't buy a truce to keep them (owner, 2026-11-19). Peace returns once
  // the AI can no longer take the land back.
  const canRetake = war.atWar && (input.outlook?.kind === "RETAKE_NOW" || input.outlook?.kind === "HOLD_FOR_REFILL");
  const townValues = input.aiPlayerId
    ? pricedReturnableTowns(input.returnableTowns, input.aiPlayerId, aiIncome, temperament, REPARATION_HOURS_PER_TILE)
    : [];
  // Set when only the retake refusal stands in the way: a town handed back lifts it.
  let retakeOnly = false;
  if (opinion.attitude === "FURIOUS" && furyHolds) truceRefusal = `${aiName} is furious with you and won't talk peace.`;
  else if (canRetake) {
    retakeOnly = true;
    truceRefusal = `${aiName} wants to see how this war goes first: it means to win its land back.` +
      (townValues.length > 0 ? ` It would make peace if you returned ${townValues.length === 1 ? "the town" : "a town"} you took from it.` : "");
  } else if (freshAttack && minutesSinceAttack !== undefined && strikesBack(input.retaliation, war.aiWinning)) {
    const minutesLeft = Math.max(1, Math.ceil(TRUCE_COOLDOWN_AFTER_ATTACK_MS / 60_000 - minutesSinceAttack));
    truceRefusal = input.retaliation
      ? `You attacked ${aiName} ${Math.max(1, Math.round(minutesSinceAttack))} min ago and they have an army ready to strike back. They won't talk peace for another ${minutesLeft} min.`
      : `You attacked ${aiName} ${Math.max(1, Math.round(minutesSinceAttack))} min ago. They won't talk peace yet.`;
  }
  const priceTruce = (): { truce12: number | null; truce24: number | null } => {
    let truce12: number | null = null;
    let truce24: number | null = null;
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
      // Meeting is how empires discover each other, so nearly every known empire
      // borders you: the neighbour price is for neighbours who attacked this AI in
      // the last day. Someone the AI raided pays the peace price.
      const attackedLately = memory.lastPlayerAttackAt !== undefined && input.now - memory.lastPlayerAttackAt < NEIGHBOUR_PRICE_WINDOW_MS;
      const baseHours = war.atWar
        ? war.aiWinning ? TRUCE_HOURS.aiWinning : TRUCE_HOURS.atWar
        : input.bordersTouch && attackedLately ? TRUCE_HOURS.neighboursAtPeace : TRUCE_HOURS.apartAtPeace;
      const reparationHours = memory.tilesTakenFromAi * REPARATION_HOURS_PER_TILE * temperament.tileGrudge;
      const desperation = input.stanceKind === "SEEKING_PEACE" && (input.bordersTouch || war.atWar) ? DESPERATE_DISCOUNT : 1;
      // The repeat surcharge stops "take land, buy peace, repeat"; a House that
      // keeps renewing peace without taking the AI's land pays the same each time.
      const repeat = memory.tilesTakenFromAi >= 1 ? 1 + REPEAT_TRUCE_SURCHARGE * memory.truceDeals : 1;
      const fresh = freshAttack ? 1 + FRESH_ATTACK_SURCHARGE : 1;
      const hours = (baseHours * temperament.trucePrice * ATTITUDE_PRICE_MULTIPLIER[opinion.attitude] * desperation + reparationHours) * repeat * fresh;
      const corps = input.requesterTruceCostMult ?? 1;
      const minimumCoin = desperation === DESPERATE_DISCOUNT && reparationHours === 0 ? 0 : 1;
      truce12 = Math.max(minimumCoin, hoursToCoin(hours * corps, aiIncome));
      truce24 = Math.max(minimumCoin, hoursToCoin(hours * LONG_TRUCE_MULTIPLIER * corps, aiIncome));
    }
    return { truce12, truce24 };
  };
  const { truce12, truce24 } = truceRefusal ? { truce12: null, truce24: null } : priceTruce();
  // Never a payment from the AI on top of getting its town back.
  const floorAtZero = (price: number | null): number | null => (price === null ? null : Math.max(0, price));
  const retakePrices = retakeOnly && townValues.length > 0 ? priceTruce() : undefined;
  const townReturn = retakePrices ? { truce12: floorAtZero(retakePrices.truce12), truce24: floorAtZero(retakePrices.truce24) } : undefined;

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
    pricing: {
      required: { truce12, truce24, alliance },
      aiHoldings,
      ...(townValues.length > 0 ? { townValues } : {}),
      ...(townReturn ? { townReturn } : {})
    },
    ...(truceRefusal ? { truceRefusal } : {}),
    ...(allianceRefusal ? { allianceRefusal } : {})
  };
};
