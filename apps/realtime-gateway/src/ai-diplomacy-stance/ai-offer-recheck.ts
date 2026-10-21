// An AI's offer (its counter-offer to a player) is a standing offer the
// player accepts later. Before it is paid and recorded, the AI weighs it
// again with what it knows *now*: a player who attacked since, outgrew the
// AI's bloc, or made the AI furious must not lock in yesterday's price.
import { emptyDiplomacyTerms, evaluateAiOffer, swapDiplomacyTerms, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { evaluateAiDiplomacy, type AiDiplomacyContextSource } from "./ai-diplomacy-evaluation.js";

export type AiOfferRecheckDeps = {
  fetchAiSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  requesterSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  diplomacyContext: AiDiplomacyContextSource;
};

/** undefined: the AI still stands by the offer. withdraw: the offer is stale and should be taken back. */
export type AiOfferRecheck = undefined | { reason: string; withdraw: boolean };

export const recheckAiOffer = async (
  deps: AiOfferRecheckDeps,
  offer: { aiPlayerId: string; aiName: string; playerId: string; kind: DiplomacyOfferKind; durationHours: 12 | 24; termsFromAi: DiplomacyTerms | undefined }
): Promise<AiOfferRecheck> => {
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
  const verdict = evaluateAiOffer(evaluation.pricing, offer.kind, offer.durationHours, playerTerms);
  if (verdict.accepts) return undefined;
  return { reason: `${offer.aiName} withdrew its offer: those terms no longer suit it. Open a new deal to see its price.`, withdraw: true };
};
