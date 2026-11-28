// A sent counter replaces the offer it answers: the gateway rejects that offer
// in the same step (apps/realtime-gateway diplomacy-counter-offer.ts). Playtest
// 2026-11-27 (pt-strategist): after countering, the offer dock over the map
// kept showing the original offer with Accept / Decline, so the player couldn't
// tell whether it was still live. The client drops it as soon as the counter is
// sent instead of waiting on the server's TRUCE_UPDATE / ALLIANCE_UPDATE; if the
// server kept it after all, its next update or a resync brings it back.
import type { DiplomacyCounterRef } from "@border-empires/shared";

export type CounteredOfferState = {
  incomingTruceRequests?: Array<{ id: string }>;
  incomingAllianceRequests?: Array<{ id: string }>;
};

const countersOf = (payload: unknown): DiplomacyCounterRef | undefined => {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { type, counters } = payload as { type?: unknown; counters?: Partial<DiplomacyCounterRef> };
  if (type !== "TRUCE_REQUEST" && type !== "ALLIANCE_REQUEST") return undefined;
  if (!counters || (counters.kind !== "truce" && counters.kind !== "alliance") || typeof counters.requestId !== "string") return undefined;
  return { kind: counters.kind, requestId: counters.requestId };
};

/** After a TRUCE_REQUEST / ALLIANCE_REQUEST carrying `counters` was sent: removes the countered offer from the incoming lists. */
export const dropCounteredOffer = (state: CounteredOfferState, payload: unknown): void => {
  const ref = countersOf(payload);
  if (!ref) return;
  if (ref.kind === "truce" && state.incomingTruceRequests) state.incomingTruceRequests = state.incomingTruceRequests.filter((request) => request.id !== ref.requestId);
  if (ref.kind === "alliance" && state.incomingAllianceRequests) state.incomingAllianceRequests = state.incomingAllianceRequests.filter((request) => request.id !== ref.requestId);
};
