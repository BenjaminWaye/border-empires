import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { computeAiDiplomacyStance, type AiDiplomacyStance } from "../ai-diplomacy-stance/ai-diplomacy-stance.js";
import { buildAiDiplomacyStanceInput } from "../ai-diplomacy-stance/ai-diplomacy-stance-input.js";
import type { SocialAllianceRequest, SocialTruceRequest } from "../social-state/social-state.js";

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
  acceptTruce: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => SocialActionResult;
  rejectTruce: (playerId: string, requestId: string, options?: { announcementByPlayerId?: Announcements; startCooldown?: boolean }) => SocialActionResult;
  acceptAlliance: (playerId: string, requestId: string, announcementByPlayerId?: Announcements) => SocialActionResult;
  rejectAlliance: (playerId: string, requestId: string, options?: { announcementByPlayerId?: Announcements; startCooldown?: boolean }) => SocialActionResult;
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

type PendingOffer = { kind: OfferKind; id: string; fromPlayerId: string; toPlayerId: string; fromName?: string; toName?: string; durationHours?: number };

export const createSeededAiDiplomacyResponder = (deps: SeededAiDiplomacyResponderDeps): SeededAiDiplomacyResponder => {
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
    const stanceInput = buildAiDiplomacyStanceInput({
      aiPlayerId: offer.toPlayerId,
      aiName,
      aiSnapshot,
      requesterId: offer.fromPlayerId,
      requesterSnapshot,
      requesterBrokeTruceWithAi: deps.requesterBrokeTruceWith(offer.fromPlayerId, offer.toPlayerId)
    });
    const stance: AiDiplomacyStance | undefined = stanceInput ? computeAiDiplomacyStance(stanceInput) : undefined;
    if (!stance) {
      deps.recordGatewayEvent("warn", "gateway_ai_diplomacy_snapshot_failed", {
        aiPlayerId: offer.toPlayerId,
        fromPlayerId: offer.fromPlayerId,
        kind: offer.kind,
        error: "target snapshot unavailable"
      });
    }
    const accepted = stance ? (offer.kind === "truce" ? stance.acceptsTruce : stance.acceptsAlliance) : false;
    const text = aiDiplomacyAnnouncements(offer.kind, accepted, { aiName, requesterName }, stance?.reason ?? UNAVAILABLE_REASON(aiName), offer.durationHours);
    const announcementByPlayerId: Announcements = { [offer.fromPlayerId]: text.toRequester, [offer.toPlayerId]: text.toAi };
    // A decline caused by our own missing snapshot is not the player's
    // fault, so it doesn't lock them out of re-offering.
    const rejectOptions = { announcementByPlayerId, startCooldown: stance !== undefined };
    const response =
      offer.kind === "truce"
        ? accepted
          ? deps.acceptTruce(offer.toPlayerId, offer.id, announcementByPlayerId)
          : deps.rejectTruce(offer.toPlayerId, offer.id, rejectOptions)
        : accepted
          ? deps.acceptAlliance(offer.toPlayerId, offer.id, announcementByPlayerId)
          : deps.rejectAlliance(offer.toPlayerId, offer.id, rejectOptions);
    if (!response.ok) {
      deps.recordGatewayEvent("warn", "gateway_ai_diplomacy_response_failed", {
        aiPlayerId: offer.toPlayerId,
        fromPlayerId: offer.fromPlayerId,
        kind: offer.kind,
        accepted,
        code: response.code,
        message: response.message
      });
      deps.fanoutPlayerPayloads(deps.syncPlayers([offer.fromPlayerId, offer.toPlayerId]).payloadsByPlayerId);
      return;
    }
    if (accepted && offer.kind === "truce") {
      await deps.syncTruceToSimulation({ playerId: offer.toPlayerId, targetPlayerId: offer.fromPlayerId, truced: true });
    }
    if (accepted && offer.kind === "alliance") {
      await deps.syncAllianceToSimulation({ playerId: offer.toPlayerId, targetPlayerId: offer.fromPlayerId, allied: true });
    }
    deps.recordGatewayEvent("info", "gateway_ai_diplomacy_response", {
      aiPlayerId: offer.toPlayerId,
      fromPlayerId: offer.fromPlayerId,
      kind: offer.kind,
      decision: accepted ? "accept" : "reject",
      stance: stance?.kind ?? "UNAVAILABLE",
      ...(offer.durationHours ? { durationHours: offer.durationHours } : {})
    });
    deps.fanoutPlayerPayloads(response.payloadsByPlayerId);
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
