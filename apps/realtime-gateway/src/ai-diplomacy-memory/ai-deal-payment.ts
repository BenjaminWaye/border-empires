import { netValueToAi, type DiplomacyTerms } from "@border-empires/shared";

/**
 * Coin the AI counts as paid to it (goodwill) for an accepted deal; negative
 * when it paid. What the other side paid for the AI's own Coin per day or for
 * one of its towns bought those, so it isn't goodwill: the AI's pledge over
 * the deal's hours comes off, and a deal where the AI hands over a town
 * records no goodwill at all.
 */
export const aiPaymentFromDeal = (
  aiId: string,
  request: { toPlayerId: string; terms?: DiplomacyTerms; durationHours?: number }
): number => {
  if (!request.terms) return 0;
  const aiIsTarget = aiId === request.toPlayerId;
  const { give, ask } = request.terms;
  // `ask` is what the proposer asked of the target.
  const aiPays = aiIsTarget ? ask : give;
  const toTarget = netValueToAi(request.terms);
  const paid = (aiIsTarget ? toTarget : -toTarget) - (aiPays.coinPerHour ?? 0) * (request.durationHours ?? 0);
  return (aiPays.towns?.length ?? 0) > 0 ? Math.min(0, paid) : paid;
};
