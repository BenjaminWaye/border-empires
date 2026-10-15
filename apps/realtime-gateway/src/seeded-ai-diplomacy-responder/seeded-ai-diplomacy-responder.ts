import {
  aiCounterOffer,
  emptyDiplomacyTerms,
  evaluateAiOffer,
  swapDiplomacyTerms,
  describeDiplomacyTermsForRecipient,
  type DiplomacyTerms
} from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { evaluateAiDiplomacy } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";
import type { SocialAllianceRequest, SocialOfferOptions, SocialTruceRequest } from "../social-state/social-state-types.js";

const extractRequestFromPayloads = <T>(payloadsByPlayerId: Map<string, unknown[]>, playerId: string, payloadType: string): T | undefined => {
  for (const payload of payloadsByPlayerId.get(playerId) ?? []) {
    if (!payload || typeof payload !== "object") continue;
    const typed = payload as { type?: unknown; request?: unknown };
    if (typed.type !== payloadType || !typed.request || typeof typed.request !== "object") continue;
    return typed.request as T;
  }
  return undefined;
};

export const extractTruceRequestFromPayloads = (payloadsByPlayerId: Map<string, unknown[]>, playerId: string): SocialTruceRequest | undefined =>
  extractRequestFromPayloads<SocialTruceRequest>(payloadsByPlayerId, playerId, "TRUCE_REQUESTED");

export const extractAllianceRequestFromPayloads = (
  payloadsByPlayerId: Map<string, unknown[]>,
  playerId: string
): SocialAllianceRequest | undefined => extractRequestFromPayloads<SocialAllianceRequest>(payloadsByPlayerId, playerId, "ALLIANCE_REQUESTED");

// Wraps an async per-key lookup with a short TTL cache, keyed by argument.
// Without this, a burst of offers targeting the same socket-less seeded AI
// (or several offers to different AI targets in a short window) each pay a
// full subscribe/unsubscribe round trip to the simulation just to read one
// snapshot -- caching the in-flight/resolved promise for a few seconds
// collapses that burst into one round trip per AI without meaningfully
// staling the reading the decision uses.
export const memoizeWithTtl = <T>(fn: (key: string) => Promise<T>, ttlMs: number): ((key: string) => Promise<T>) => {
  const cache = new Map<string, { value: Promise<T>; expiresAt: number }>();
  return (key: string): Promise<T> => {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    // Expired entries are dropped as new keys arrive, so the map stays bounded
    // by the number of AIs touched within one TTL window.
    for (const [cachedKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(cachedKey);
    }
    const value = fn(key);
    cache.set(key, { value, expiresAt: now + ttlMs });
    return value;
  };
};

type SocialActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };

type Announcements = Partial<Record<string, string>>;

export type SeededAiDiplomacyResponderDeps = {
  seededAiPlayerIds: ReadonlySet<string>;
  // A real-time fetch of the AI's current player state, not a cache lookup:
  // seeded AI players almost never have a live socket (see hasLiveSocket
  // below), so the gateway never has a cached subscription snapshot for
  // them -- this must pull live state straight from the simulation (e.g. via
  // playerSubscriptions.ensureSubscribed), or the decision never reflects
  // real battle losses.
  fetchPlayerSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  /** The requester is online (they just sent the offer); prefer their cached snapshot. */
  requesterSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  requesterBrokeTruceWith: (requesterId: string, aiPlayerId: string) => boolean;
  // A seeded-AI identity that a human has actually claimed with a live
  // socket is no longer AI-controlled for social decisions -- the human
  // decides their own offers. Without this, the auto-responder can race a
  // human's own ACCEPT/REJECT and resolve the request first.
  hasLiveSocket: (playerId: string) => boolean;
  /** Pays out any terms in the simulation before recording (diplomacy-offer-acceptance.ts). */
  acceptTruce: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => Promise<SocialActionResult>;
  rejectTruce: (playerId: string, requestId: string, options?: { announcementByPlayerId?: Announcements; startCooldown?: boolean }) => SocialActionResult;
  acceptAlliance: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => Promise<SocialActionResult>;
  rejectAlliance: (playerId: string, requestId: string, options?: { announcementByPlayerId?: Announcements; startCooldown?: boolean }) => SocialActionResult;
  /** The AI's counter-offer goes back to the requester as a fresh offer from the AI. */
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24, options?: SocialOfferOptions) => SocialActionResult;
  requestAlliance: (fromPlayerId: string, targetPlayerName: string, options?: SocialOfferOptions) => SocialActionResult;
  syncPlayers: (playerIds: string[]) => { payloadsByPlayerId: Map<string, unknown[]> };
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  // The gateway's normal ACCEPT handlers sync to the simulation before
  // fanning out payloads; this auto-responder must do the same or AI truces
  // and alliances silently fail to block combat/observatory actions.
  syncTruceToSimulation: (input: { playerId: string; targetPlayerId: string; truced: boolean }) => Promise<boolean>;
  syncAllianceToSimulation: (input: { playerId: string; targetPlayerId: string; allied: boolean }) => Promise<boolean>;
};

export type SeededAiDiplomacyResponder = {
  maybeAutoRespondToSeededAiTruce: (request: SocialTruceRequest | undefined) => Promise<void>;
  maybeAutoRespondToSeededAiAlliance: (request: SocialAllianceRequest | undefined) => Promise<void>;
};

type OfferKind = "truce" | "alliance";

// "Milo declined your truce offer. Milo fears your strength." The client
// titles a truce popup "Truce declined" off the word "declined", so decline
// wording must keep it and accept wording must not use it.
export const aiDiplomacyAnnouncements = (
  kind: OfferKind,
  accepted: boolean,
  names: { aiName: string; requesterName: string },
  reason: string,
  durationHours?: number
): { toRequester: string; toAi: string } => {
  const offer = kind === "truce" ? `${durationHours ? `${durationHours}h ` : ""}truce` : "alliance";
  if (accepted) {
    return {
      toRequester: `${names.aiName} accepted your ${offer}. ${reason}`,
      toAi: `You accepted ${names.requesterName}'s ${offer}.`
    };
  }
  return {
    toRequester: `${names.aiName} declined your ${offer} offer. ${reason}`,
    toAi: `You declined ${names.requesterName}'s ${offer} offer.`
  };
};

const UNAVAILABLE_REASON = (aiName: string): string => `${aiName} couldn't weigh your offer right now. Try again shortly.`;

type PendingOffer = {
  kind: OfferKind;
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  fromName?: string;
  toName?: string;
  durationHours?: 12 | 24;
  terms?: DiplomacyTerms;
};

type Decision =
  | { kind: "accept"; reason: string }
  | { kind: "decline"; reason: string; startCooldown: boolean }
  | { kind: "counter"; reason: string; terms: DiplomacyTerms };

export const createSeededAiDiplomacyResponder = (deps: SeededAiDiplomacyResponderDeps): SeededAiDiplomacyResponder => {
  const decide = (offer: PendingOffer, aiName: string, evaluation: ReturnType<typeof evaluateAiDiplomacy>): Decision => {
    if (!evaluation) return { kind: "decline", reason: UNAVAILABLE_REASON(aiName), startCooldown: false };
    const { stance, pricing, requesterHoldings } = evaluation;
    const duration = offer.durationHours ?? 12;
    const terms = offer.terms ?? emptyDiplomacyTerms();
    const verdict = evaluateAiOffer(pricing, offer.kind, duration, terms);
    if (verdict.accepts) return { kind: "accept", reason: stance.reason };
    const counter = aiCounterOffer(pricing, offer.kind, duration, terms, requesterHoldings);
    if (counter.kind === "counter") return { kind: "counter", reason: stance.reason, terms: counter.terms };
    if (counter.kind === "cannotAfford") {
      return { kind: "decline", reason: `${stance.reason} ${aiName} wants about ${counter.shortfall} coin more than you can offer.`, startCooldown: true };
    }
    return { kind: "decline", reason: stance.reason, startCooldown: true };
  };

  const respond = async (offer: PendingOffer): Promise<void> => {
    if (!deps.seededAiPlayerIds.has(offer.toPlayerId)) return;
    if (deps.hasLiveSocket(offer.toPlayerId)) return;
    const [aiSnapshot, requesterSnapshot] = await Promise.all([
      deps.fetchPlayerSnapshot(offer.toPlayerId),
      deps.requesterSnapshot(offer.fromPlayerId).catch(() => undefined)
    ]);
    // Re-check: the fetches above await real round trips to the simulation,
    // wide enough for a human to claim this identity mid-flight.
    if (deps.hasLiveSocket(offer.toPlayerId)) return;
    const aiName = offer.toName ?? offer.toPlayerId;
    const requesterName = offer.fromName ?? offer.fromPlayerId;
    const evaluation = evaluateAiDiplomacy({
      aiPlayerId: offer.toPlayerId,
      aiName,
      aiSnapshot,
      requesterId: offer.fromPlayerId,
      requesterSnapshot,
      requesterBrokeTruceWithAi: deps.requesterBrokeTruceWith(offer.fromPlayerId, offer.toPlayerId)
    });
    if (!evaluation) {
      deps.recordGatewayEvent("warn", "gateway_ai_diplomacy_snapshot_failed", {
        aiPlayerId: offer.toPlayerId,
        fromPlayerId: offer.fromPlayerId,
        kind: offer.kind,
        error: "target snapshot unavailable"
      });
    }
    const decision = decide(offer, aiName, evaluation);
    const names = { aiName, requesterName };
    const announce = (accepted: boolean, reason: string): Announcements => {
      const text = aiDiplomacyAnnouncements(offer.kind, accepted, names, reason, offer.durationHours);
      return { [offer.fromPlayerId]: text.toRequester, [offer.toPlayerId]: text.toAi };
    };
    const decline = (reason: string, startCooldown: boolean): SocialActionResult => {
      const options = { announcementByPlayerId: announce(false, reason), startCooldown };
      return offer.kind === "truce" ? deps.rejectTruce(offer.toPlayerId, offer.id, options) : deps.rejectAlliance(offer.toPlayerId, offer.id, options);
    };

    let response: SocialActionResult;
    let outcome: string = decision.kind;
    if (decision.kind === "accept") {
      const announcementByPlayerId = announce(true, decision.reason);
      response =
        offer.kind === "truce"
          ? await deps.acceptTruce(offer.toPlayerId, offer.id, announcementByPlayerId)
          : await deps.acceptAlliance(offer.toPlayerId, offer.id, announcementByPlayerId);
      // The AI said yes but the payment failed (e.g. the requester spent the
      // coin meanwhile): turn it into a decline that names why, no cooldown.
      if (!response.ok && response.code === "DIPLOMACY_SETTLEMENT_FAILED") {
        outcome = "settlement_failed";
        response = decline(response.message, false);
      }
    } else {
      response = decline(decision.reason, decision.kind === "decline" ? decision.startCooldown : true);
    }
    if (!response.ok) {
      deps.recordGatewayEvent("warn", "gateway_ai_diplomacy_response_failed", {
        aiPlayerId: offer.toPlayerId,
        fromPlayerId: offer.fromPlayerId,
        kind: offer.kind,
        outcome,
        code: response.code,
        message: response.message
      });
      deps.fanoutPlayerPayloads(deps.syncPlayers([offer.fromPlayerId, offer.toPlayerId]).payloadsByPlayerId);
      return;
    }
    if (outcome === "accept" && offer.kind === "truce") {
      await deps.syncTruceToSimulation({ playerId: offer.toPlayerId, targetPlayerId: offer.fromPlayerId, truced: true });
    }
    if (outcome === "accept" && offer.kind === "alliance") {
      await deps.syncAllianceToSimulation({ playerId: offer.toPlayerId, targetPlayerId: offer.fromPlayerId, allied: true });
    }
    deps.recordGatewayEvent("info", "gateway_ai_diplomacy_response", {
      aiPlayerId: offer.toPlayerId,
      fromPlayerId: offer.fromPlayerId,
      kind: offer.kind,
      decision: outcome,
      stance: evaluation?.stance.kind ?? "UNAVAILABLE",
      hasTerms: Boolean(offer.terms),
      ...(offer.durationHours ? { durationHours: offer.durationHours } : {})
    });
    deps.fanoutPlayerPayloads(response.payloadsByPlayerId);
    if (decision.kind === "counter") sendCounterOffer(offer, decision.terms);
  };

  // The counter goes back as the AI's own offer, so the requester accepts or
  // rejects it like any incoming offer. Its terms are from the AI's side.
  const sendCounterOffer = (offer: PendingOffer, requesterTerms: DiplomacyTerms): void => {
    const options: SocialOfferOptions = { targetPlayerId: offer.fromPlayerId, terms: swapDiplomacyTerms(requesterTerms) };
    const counter =
      offer.kind === "truce"
        ? deps.requestTruce(offer.toPlayerId, offer.fromName ?? offer.fromPlayerId, offer.durationHours ?? 12, options)
        : deps.requestAlliance(offer.toPlayerId, offer.fromName ?? offer.fromPlayerId, options);
    deps.recordGatewayEvent(counter.ok ? "info" : "warn", "gateway_ai_diplomacy_counter_offer", {
      aiPlayerId: offer.toPlayerId,
      fromPlayerId: offer.fromPlayerId,
      kind: offer.kind,
      ok: counter.ok,
      terms: describeDiplomacyTermsForRecipient(options.terms, offer.toName ?? offer.toPlayerId),
      ...(counter.ok ? {} : { code: counter.code })
    });
    if (counter.ok) deps.fanoutPlayerPayloads(counter.payloadsByPlayerId);
  };

  return {
    maybeAutoRespondToSeededAiTruce: async (request) => {
      if (request) await respond({ kind: "truce", ...request });
    },
    maybeAutoRespondToSeededAiAlliance: async (request) => {
      if (request) await respond({ kind: "alliance", ...request });
    }
  };
};
