import { swapDiplomacyTerms, type DiplomacyTerms } from "@border-empires/shared";
import { treatySettlementId } from "../social-state/social-offer-settlement-state.js";
import type { SocialActionResult, SocialPendingOffer } from "../social-state/social-state-types.js";
import type { DiplomacyOfferAcceptanceDeps } from "./diplomacy-offer-acceptance.js";

/** Consent is persisted before submission; retries reuse the exact payment identity. */
export async function settleResourceTreaty(
  deps: DiplomacyOfferAcceptanceDeps,
  kind: "truce" | "alliance",
  request: SocialPendingOffer["request"],
  terms: DiplomacyTerms,
  record: () => SocialActionResult
): Promise<SocialActionResult> {
  const commandId = treatySettlementId(kind, request.id);
  const closeOffer = (): void => {
    const result = deps.socialState.discardSettlement(kind, request.id);
    if (result.ok) deps.onDiscarded?.(result);
  };
  const refund = async (failure: SocialActionResult): Promise<SocialActionResult> => {
    // Persist compensation before submitting, so a crash cannot retry payment.
    deps.socialState.setSettlementPhase(kind, request.id, "refunding");
    deps.onProgress?.(request);
    const result = await deps.settlement.settle({
      proposerId: request.fromPlayerId, targetId: request.toPlayerId,
      terms: swapDiplomacyTerms(terms), commandId: `${commandId}:refund`,
      issuedAt: request.createdAt, refundIfLate: false, refundOf: commandId
    });
    // A rejected refund has released its supply contract, even when already
    // spent Coin/Shards need separate recovery (the simulation logs the failure).
    if (result.ok || result.rejected) closeOffer();
    deps.recordGatewayEvent(result.ok ? "warn" : "error", "gateway_diplomacy_settlement_refunded", {
      requestId: request.id, kind, refunded: result.ok, pending: !result.ok && (result.pending ?? false)
    });
    return failure;
  };
  try {
    if (request.settlementPhase === "refunding") return await refund({ ok: false, code: "DIPLOMACY_SETTLEMENT_FAILED", message: "This treaty could not be recorded; its payment is being returned." });
    deps.socialState.setSettlementPhase(kind, request.id, "paying");
    deps.onProgress?.(request);
    const paid = await deps.settlement.settle({
      proposerId: request.fromPlayerId, targetId: request.toPlayerId, terms,
      commandId, issuedAt: request.createdAt, refundIfLate: false
    });
    if (!paid.ok) {
      if (paid.rejected) closeOffer();
      return { ok: false, code: "DIPLOMACY_SETTLEMENT_FAILED", message: paid.message };
    }
    const recorded = record();
    if (!recorded.ok) return await refund(recorded);
    deps.onAccepted?.(kind, request);
    return recorded;
  } finally {
    deps.socialState.endSettlement(request.id);
  }
}
