// Free AI peace offers stand until expiry or combat withdraws them from
// SocialState. Paid counters and alliances are rechecked before settlement:
// an AI may no longer afford a payment or qualify for the resulting bloc.
import { diplomacyTermsAreEmpty, emptyDiplomacyTerms, evaluateAiOffer, extensionPricing, swapDiplomacyTerms, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { evaluateAiDiplomacy, type AiDiplomacyContextSource } from "./ai-diplomacy-evaluation.js";

/** How far past the agreed coin the AI's price may drift before it withdraws: prices follow live income. */
const COUNTER_PRICE_TOLERANCE = 0.1;

export type AiOfferRecheckDeps = {
  fetchAiSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  requesterSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  diplomacyContext: AiDiplomacyContextSource;
};

/** undefined: the AI still stands by the offer. withdraw: the offer is stale and should be taken back. */
export type AiOfferRecheck = undefined | { reason: string; withdraw: boolean };

export const recheckAiOffer = async (
  deps: AiOfferRecheckDeps,
  offer: { aiPlayerId: string; aiName: string; playerId: string; kind: DiplomacyOfferKind; durationHours: 12 | 24; termsFromAi: DiplomacyTerms | undefined; extendsTruce?: boolean }
): Promise<AiOfferRecheck> => {
  // Proactive peace is an offer of peace for free, not an invitation to
  // recalculate what the player should pay later. This also honors restored
  // offers after login, even if the AI has recovered or snapshots are unavailable.
  // Combat invalidation belongs to withdrawTruceOffersOnCombat, which removes
  // the offer and updates both clients when fighting resumes.
  if (offer.kind === "truce" && diplomacyTermsAreEmpty(offer.termsFromAi)) return undefined;
  const [aiSnapshot, requesterSnapshot] = await Promise.all([
    deps.fetchAiSnapshot(offer.aiPlayerId),
    deps.requesterSnapshot(offer.playerId).catch(() => undefined)
  ]);
  const evaluation = evaluateAiDiplomacy({
    aiPlayerId: offer.aiPlayerId,
    aiName: offer.aiName,
    aiSnapshot,
    requesterId: offer.playerId,
    requesterSnapshot,
    ...(await deps.diplomacyContext(offer.playerId, offer.aiPlayerId))
  });
  // Can't judge right now: refuse this time, but leave the offer standing.
  if (!evaluation) return { reason: `${offer.aiName} couldn't confirm the deal right now. Try again shortly.`, withdraw: false };
  const refusal = offer.kind === "truce" ? evaluation.truceRefusal : evaluation.allianceRefusal;
  if (refusal) return { reason: `${offer.aiName} withdrew its offer. ${refusal}`, withdraw: true };
  // The player's side of the deal is the AI's terms swapped.
  const playerTerms = offer.termsFromAi ? swapDiplomacyTerms(offer.termsFromAi) : emptyDiplomacyTerms();
  const pricing = offer.extendsTruce ? extensionPricing(evaluation.pricing) : evaluation.pricing;
  const verdict = evaluateAiOffer(pricing, offer.kind, offer.durationHours, playerTerms);
  if (verdict.accepts) return undefined;
  if (verdict.reason === "shortfall" && verdict.shortfall <= playerTerms.give.gold * COUNTER_PRICE_TOLERANCE) return undefined;
  return { reason: `${offer.aiName} withdrew its offer: those terms no longer suit it. Open a new deal to see its price.`, withdraw: true };
};
