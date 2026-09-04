import type { DomainPlayer } from "@border-empires/game-domain";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { SocialTruceRequest } from "../social-state/social-state.js";

export const extractTruceRequestFromPayloads = (
  payloadsByPlayerId: Map<string, unknown[]>,
  playerId: string
): SocialTruceRequest | undefined => {
  for (const payload of payloadsByPlayerId.get(playerId) ?? []) {
    if (!payload || typeof payload !== "object") continue;
    const typed = payload as { type?: unknown; request?: unknown };
    if (typed.type !== "TRUCE_REQUESTED" || !typed.request || typeof typed.request !== "object") continue;
    return typed.request as SocialTruceRequest;
  }
  return undefined;
};

// An AI keeps fighting for as long as it has manpower to fight with; only
// once its manpower runs low relative to its own cap does it seek a truce.
// Territory/economy state is deliberately not consulted -- manpower is the
// AI's actual capacity to keep fighting, so it's the only signal that matters.
const LOW_MANPOWER_RATIO = 0.2;

// manpowerCap <= 0 means no real cap data was found (not that the AI is
// literally capped at zero) -- default to "keep fighting" rather than
// treating missing data as grounds to accept.
const seededAiTruceDecisionFromManpower = (manpower: number, manpowerCap: number): "accept" | "reject" =>
  manpowerCap > 0 && manpower / manpowerCap <= LOW_MANPOWER_RATIO ? "accept" : "reject";

type SocialTruceActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };

export type SeededAiTruceResponderDeps = {
  seededAiPlayerIds: ReadonlySet<string>;
  seedPlayers: Map<string, DomainPlayer>;
  // A real-time fetch of the AI's current player state, not a cache lookup:
  // seeded AI players almost never have a live socket (see hasLiveSocket
  // below), so the gateway never has a cached subscription snapshot for
  // them -- fetchPlayerSnapshot must pull live manpower straight from the
  // simulation (e.g. via playerSubscriptions.ensureSubscribed), or the
  // decision will always fall back to the frozen seed-time manpower value
  // and never reflect real battle losses.
  fetchPlayerSnapshot: (playerId: string) => Promise<PlayerSubscriptionSnapshot | undefined>;
  // A seeded-AI identity that a human has actually claimed with a live
  // socket is no longer AI-controlled for social decisions -- the human
  // decides their own truces. Without this, the auto-responder can race a
  // human's own TRUCE_ACCEPT/TRUCE_REJECT and resolve the request first.
  hasLiveSocket: (playerId: string) => boolean;
  acceptTruce: (playerId: string, requestId: string) => SocialTruceActionResult;
  rejectTruce: (
    playerId: string,
    requestId: string,
    announcementByPlayerId?: Partial<Record<string, string>>
  ) => SocialTruceActionResult;
  syncPlayers: (playerIds: string[]) => { payloadsByPlayerId: Map<string, unknown[]> };
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  // The gateway's normal TRUCE_ACCEPT handler syncs the truce to the
  // simulation before fanning out payloads; this auto-responder must do the
  // same or seeded-AI truces silently fail to block combat/observatory
  // actions server-side.
  syncTruceToSimulation: (input: { playerId: string; targetPlayerId: string; truced: boolean }) => Promise<boolean>;
};

export type SeededAiTruceResponder = {
  maybeAutoRespondToSeededAiTruce: (request: SocialTruceRequest | undefined) => Promise<void>;
};

export const createSeededAiTruceResponder = (deps: SeededAiTruceResponderDeps): SeededAiTruceResponder => ({
  maybeAutoRespondToSeededAiTruce: async (request: SocialTruceRequest | undefined): Promise<void> => {
    if (!request || !deps.seededAiPlayerIds.has(request.toPlayerId)) return;
    if (deps.hasLiveSocket(request.toPlayerId)) return;
    const targetSnapshot = await deps.fetchPlayerSnapshot(request.toPlayerId);
    const seedPlayer = deps.seedPlayers.get(request.toPlayerId);
    const manpower = targetSnapshot?.player?.manpower ?? seedPlayer?.manpower ?? 0;
    const manpowerCap = targetSnapshot?.player?.manpowerCap ?? seedPlayer?.manpowerCapSnapshot ?? 0;
    const decision = seededAiTruceDecisionFromManpower(manpower, manpowerCap);
    if (!targetSnapshot) {
      deps.recordGatewayEvent("warn", "gateway_ai_truce_snapshot_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        error: "target snapshot unavailable"
      });
    }

    const aiName = request.toName ?? request.toPlayerId;
    const response =
      decision === "accept"
        ? deps.acceptTruce(request.toPlayerId, request.id)
        : deps.rejectTruce(request.toPlayerId, request.id, {
            [request.fromPlayerId]: `${aiName} declined your truce offer.`,
            [request.toPlayerId]: `You declined ${request.fromName ?? request.fromPlayerId}'s truce offer.`
          });
    if (!response.ok) {
      deps.recordGatewayEvent("warn", "gateway_ai_truce_response_failed", {
        aiPlayerId: request.toPlayerId,
        fromPlayerId: request.fromPlayerId,
        decision,
        code: response.code,
        message: response.message
      });
      deps.fanoutPlayerPayloads(deps.syncPlayers([request.fromPlayerId, request.toPlayerId]).payloadsByPlayerId);
      return;
    }
    if (decision === "accept") {
      await deps.syncTruceToSimulation({ playerId: request.toPlayerId, targetPlayerId: request.fromPlayerId, truced: true });
    }
    deps.recordGatewayEvent("info", "gateway_ai_truce_response", {
      aiPlayerId: request.toPlayerId,
      fromPlayerId: request.fromPlayerId,
      decision,
      durationHours: request.durationHours
    });
    deps.fanoutPlayerPayloads(response.payloadsByPlayerId);
  }
});
