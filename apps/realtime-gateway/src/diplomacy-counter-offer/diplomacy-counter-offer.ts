// Counter-offers: a TRUCE_REQUEST / ALLIANCE_REQUEST carrying `counters`
// replies to an offer the sender received. Rejecting it here, in the same
// handler step as the new request, is what makes a counter possible at all:
// a pending offer between two players blocks a new one, and a separate
// client-sent TRUCE_REJECT isn't guaranteed to be processed first.
import type { ClientMessage } from "@border-empires/shared";

import type { SocialActionResult, SocialRejectOptions } from "../social-state/social-state-types.js";

export type DiplomacyCounterOfferDeps = {
  rejectTruce: (playerId: string, requestId: string, options?: SocialRejectOptions) => SocialActionResult;
  rejectAlliance: (playerId: string, requestId: string, options?: SocialRejectOptions) => SocialActionResult;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
};

/**
 * Rejects the offer a counter replies to, before the counter itself is handled.
 * No re-offer cooldown: a counter isn't a "no", and if the counter is then
 * refused (cooldown, guest lock) the original sender can still offer again.
 * A countered offer that's already gone (expired, accepted elsewhere) is ignored;
 * the counter is still sent as a fresh offer.
 */
export const rejectCounteredOffer = (deps: DiplomacyCounterOfferDeps, message: ClientMessage, playerId: string): void => {
  if (message.type !== "TRUCE_REQUEST" && message.type !== "ALLIANCE_REQUEST") return;
  if (!message.counters) return;
  const { kind, requestId } = message.counters;
  const reject = kind === "truce" ? deps.rejectTruce : deps.rejectAlliance;
  const result = reject(playerId, requestId, { startCooldown: false });
  if (result.ok) deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
};
