// Accepting an offer that carries terms: lock the offer, have the simulation
// move the coin/Shards, then record the agreement. Offers without terms
// accept exactly as before.
import { diplomacyTermsAreEmpty, swapDiplomacyTerms } from "@border-empires/shared";

import type { SocialActionResult, SocialPendingOffer, SocialState } from "../social-state/social-state-types.js";
import type { DiplomacySettlement } from "./diplomacy-settlement.js";

type Announcements = Partial<Record<string, string>>;

export type DiplomacyOfferAcceptanceDeps = {
  socialState: Pick<SocialState, "beginSettlement" | "endSettlement" | "acceptTruce" | "acceptAlliance">;
  settlement: Pick<DiplomacySettlement, "settle">;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  /** After an agreement is recorded (and any terms paid). */
  onAccepted?: (kind: "truce" | "alliance", request: SocialPendingOffer["request"]) => void;
};

export type DiplomacyOfferAcceptance = {
  acceptTruce: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => Promise<SocialActionResult>;
  acceptAlliance: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => Promise<SocialActionResult>;
};

export const createDiplomacyOfferAcceptance = (deps: DiplomacyOfferAcceptanceDeps): DiplomacyOfferAcceptance => {
  const accept = async (
    kind: "truce" | "alliance",
    playerId: string,
    requestId: string,
    record: () => SocialActionResult
  ): Promise<SocialActionResult> => {
    const begun = deps.socialState.beginSettlement(kind, playerId, requestId);
    if (!begun.ok) return begun;
    const { request } = begun.offer;
    const terms = request.terms;
    if (!terms || diplomacyTermsAreEmpty(terms)) {
      deps.socialState.endSettlement(requestId);
      const recordedFree = record();
      if (recordedFree.ok) deps.onAccepted?.(kind, request);
      return recordedFree;
    }
    const paid = await deps.settlement.settle({ proposerId: request.fromPlayerId, targetId: request.toPlayerId, terms });
    if (!paid.ok) {
      deps.socialState.endSettlement(requestId);
      return { ok: false, code: "DIPLOMACY_SETTLEMENT_FAILED", message: paid.message };
    }
    const recorded = record();
    if (!recorded.ok) {
      // The lock keeps cancel/reject/expiry out, but e.g. a truce lockout
      // that started meanwhile can still refuse the agreement: give the
      // payment back so nobody pays for a deal that didn't happen.
      deps.socialState.endSettlement(requestId);
      const refund = await deps.settlement.settle({ proposerId: request.fromPlayerId, targetId: request.toPlayerId, terms: swapDiplomacyTerms(terms), refundIfLate: false });
      deps.recordGatewayEvent(refund.ok ? "warn" : "error", "gateway_diplomacy_settlement_refunded", {
        requestId,
        kind,
        code: recorded.code,
        refunded: refund.ok
      });
    } else {
      deps.onAccepted?.(kind, request);
    }
    return recorded;
  };

  return {
    acceptTruce: (playerId, requestId, announcementByPlayerId) =>
      accept("truce", playerId, requestId, () => deps.socialState.acceptTruce(playerId, requestId, announcementByPlayerId)),
    acceptAlliance: (playerId, requestId, announcementByPlayerId) =>
      accept("alliance", playerId, requestId, () => deps.socialState.acceptAlliance(playerId, requestId, announcementByPlayerId))
  };
};
