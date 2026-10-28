import type { SocialActionResult, SocialAllianceRequest, SocialPendingOffer, SocialState, SocialStateSink, SocialTruceRequest } from "./social-state-types.js";

export type TreatySettlementPhase = "paying" | "refunding";
export const treatySettlementId = (kind: "truce" | "alliance", id: string): string => `diplomacy-settle:${kind}:${id}`;

type SettlementMethods = Pick<SocialState, "beginSettlement" | "endSettlement" | "setSettlementPhase" | "discardSettlement" | "isTreatySupplySettling">;
interface SettlementStateDeps {
  allianceRequests: Map<string, SocialAllianceRequest>;
  truceRequests: Map<string, SocialTruceRequest>;
  settlingRequestIds: Set<string>;
  now(): number;
  sweepExpired(): void;
  sink: Pick<SocialStateSink, "saveAllianceRequest" | "saveTruceRequest" | "deleteAllianceRequest" | "deleteTruceRequest"> | undefined;
  updates(ids: string[]): SocialActionResult;
  validateTruceOffer(request: SocialTruceRequest): Extract<SocialActionResult, { ok: false }> | undefined;
}

/** Reuses the offer maps; persistent phases survive restart without a second ledger. */
export function createSocialOfferSettlementState(deps: SettlementStateDeps): SettlementMethods {
  const offerFor = (kind: "truce" | "alliance", id: string): SocialPendingOffer | undefined => {
    if (kind === "truce") {
      const request = deps.truceRequests.get(id);
      return request ? { kind, request } : undefined;
    }
    const request = deps.allianceRequests.get(id);
    return request ? { kind, request } : undefined;
  };
  return {
    beginSettlement(kind, playerId, requestId) {
      deps.sweepExpired();
      if (deps.settlingRequestIds.has(requestId)) return { ok: false, code: "OFFER_SETTLING", message: "That offer is being settled right now." };
      const offer = offerFor(kind, requestId);
      if (!offer || offer.request.toPlayerId !== playerId || (offer.kind === "truce" && !offer.request.settlementPhase && offer.request.expiresAt < deps.now())) {
        return { ok: false, code: kind === "truce" ? "TRUCE_REQUEST_INVALID" : "ALLIANCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      if (offer.kind === "truce" && !offer.request.settlementPhase) {
        const error = deps.validateTruceOffer(offer.request);
        if (error) return error;
      }
      deps.settlingRequestIds.add(requestId);
      return { ok: true, offer };
    },
    endSettlement: id => { deps.settlingRequestIds.delete(id); },
    setSettlementPhase(kind, id, phase) {
      const offer = offerFor(kind, id);
      if (!offer) throw new Error("Settlement offer disappeared while locked");
      offer.request.settlementPhase = phase;
      if (offer.kind === "truce") deps.sink?.saveTruceRequest(offer.request);
      else deps.sink?.saveAllianceRequest(offer.request);
    },
    discardSettlement(kind, id) {
      const offer = offerFor(kind, id);
      if (!offer) return { ok: false, code: "OFFER_MISSING", message: "This offer is no longer available." };
      if (kind === "truce") { deps.truceRequests.delete(id); deps.sink?.deleteTruceRequest(id); }
      else { deps.allianceRequests.delete(id); deps.sink?.deleteAllianceRequest(id); }
      deps.settlingRequestIds.delete(id);
      return deps.updates([offer.request.fromPlayerId, offer.request.toPlayerId]);
    },
    isTreatySupplySettling(agreementId, actorId) {
      for (const kind of ["truce", "alliance"] as const) {
        const prefix = treatySettlementId(kind, "");
        if (!agreementId.startsWith(prefix)) continue;
        const offer = offerFor(kind, agreementId.slice(prefix.length));
        return Boolean(offer?.request.settlementPhase && [offer.request.fromPlayerId, offer.request.toPlayerId].includes(actorId));
      }
      return false;
    }
  };
}
