// Wires the ALLIANCE_* / TRUCE_* socket handlers, the trade screen's stance
// query, deal settlement, and the seeded-AI diplomacy responder, extracted out of gateway-app.ts (well over the repo's
// 500-line file-size gate and may not grow further -- see AGENTS.md's
// file-and-type-discipline rule).
import { netValueToAi, SHARD_COIN_VALUE, type ClientMessage } from "@border-empires/shared";
import type { CommandEnvelope, PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { WebSocket } from "ws";

import { combatFromSimulationEvent, createAiDiplomacyMemory } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { createAiAllianceReview } from "../ai-diplomacy-stance/ai-alliance-review.js";
import { recheckAiOffer } from "../ai-diplomacy-stance/ai-offer-recheck.js";
import type { AiDiplomacyContext } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";
import { answerDiplomacyStanceQuery } from "../ai-diplomacy-stance/diplomacy-stance-query.js";
import { handleAllianceSocketMessage, type AllianceSocketMessageDeps } from "../alliance-socket-messages/alliance-socket-messages.js";
import { createDiplomacyOfferAcceptance } from "../diplomacy-settlement/diplomacy-offer-acceptance.js";
import { createDiplomacySettlement, type DiplomacySettlement } from "../diplomacy-settlement/diplomacy-settlement.js";
import { lockedForGuests } from "../guest-diplomacy-lock/guest-diplomacy-lock.js";
import { createSeededAiDiplomacyResponder, memoizeWithTtl } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";
import type { SocialState } from "../social-state/social-state.js";
import { handleTruceSocketMessage, type TruceSocketMessageDeps } from "../truce-socket-messages/truce-socket-messages.js";

export type DiplomacySocketHandlerDeps = {
  socialState: SocialState;
  seededAiPlayerIds: ReadonlySet<string>;
  /** Live sim snapshot for a player, subscribing if needed (playerSubscriptions.ensureSubscribed). */
  ensureSubscribed: (playerId: string) => Promise<PlayerSubscriptionSnapshot>;
  cachedSnapshotForPlayer: (playerId: string) => PlayerSubscriptionSnapshot | undefined;
  hasLiveSocket: (playerId: string) => boolean;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  syncTruceToSimulation: TruceSocketMessageDeps["syncTruceToSimulation"];
  syncAllianceToSimulation: AllianceSocketMessageDeps["syncAllianceToSimulation"];
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  sendGameplayEmailAlert: AllianceSocketMessageDeps["sendGameplayEmailAlert"] & TruceSocketMessageDeps["sendGameplayEmailAlert"];
  sendAllianceRequestAlert: AllianceSocketMessageDeps["sendAllianceRequestAlert"];
  sendAllianceBreakAlert: AllianceSocketMessageDeps["sendAllianceBreakAlert"];
  sendTruceRequestAlert: TruceSocketMessageDeps["sendTruceRequestAlert"];
  onDiplomacyInteraction: (playerId: string, targetPlayerId: string | undefined, kind: "truce" | "alliance") => void;
  gatewayMetrics: { incrementGuestDiplomacyBlockedTotal: () => void };
  /** Already wrapped in the gateway's submit timeout. */
  submitSimulationCommand: (command: CommandEnvelope) => Promise<unknown>;
  isSimulationConnected: () => boolean;
};

export type DiplomacySocketHandler = {
  handleMessage: (
    message: ClientMessage,
    session: { playerId?: string | undefined; isGuest?: boolean | undefined },
    socket: WebSocket
  ) => Promise<boolean>;
  /** Has AIs leave alliances they no longer lead (self-throttled; call it from a recurring task). */
  reviewAiAlliances: () => Promise<void>;
  /** Routes deal-settlement verdicts and combat (for AI memory) from the simulation event stream. */
  observeSimulationEvent: (event: Parameters<DiplomacySettlement["observe"]>[0] & Parameters<typeof combatFromSimulationEvent>[0]) => void;
};

export const buildDiplomacySocketHandler = (deps: DiplomacySocketHandlerDeps): DiplomacySocketHandler => {
  const { socialState } = deps;
  const settlement = createDiplomacySettlement({
    submitCommand: deps.submitSimulationCommand,
    isSimulationConnected: deps.isSimulationConnected,
    now: () => Date.now(),
    setTimer: (task, delayMs) => {
      const handle = setTimeout(task, delayMs);
      return { clear: () => clearTimeout(handle) };
    },
    recordGatewayEvent: deps.recordGatewayEvent
  });
  const isAi = (playerId: string): boolean => deps.seededAiPlayerIds.has(playerId);
  const memory = createAiDiplomacyMemory({ now: () => Date.now(), isAi });
  const acceptance = createDiplomacyOfferAcceptance({
    socialState,
    settlement,
    recordGatewayEvent: deps.recordGatewayEvent,
    // AIs remember deals: repeat truce buying costs more, payments build goodwill.
    onAccepted: (kind, request) => {
      const aiId = isAi(request.toPlayerId) ? request.toPlayerId : isAi(request.fromPlayerId) ? request.fromPlayerId : undefined;
      if (!aiId) return;
      const otherId = aiId === request.toPlayerId ? request.fromPlayerId : request.toPlayerId;
      if (kind === "truce") memory.recordTruceDeal(aiId, otherId);
      if (request.terms) {
        const toTarget = netValueToAi(request.terms, SHARD_COIN_VALUE);
        memory.recordPayment(aiId, otherId, aiId === request.toPlayerId ? toTarget : -toTarget);
      }
    },
    // An AI's counter-offer stands until accepted: it re-weighs it first.
    recheckProposer: async (kind, request) => {
      const aiId = request.fromPlayerId;
      if (!isAi(aiId) || deps.hasLiveSocket(aiId)) return undefined;
      return recheckAiOffer(
        { fetchAiSnapshot, requesterSnapshot, diplomacyContext },
        {
          aiPlayerId: aiId,
          aiName: request.fromName ?? socialState.playerNameOf(aiId),
          playerId: request.toPlayerId,
          kind,
          durationHours: "durationHours" in request ? request.durationHours : 12,
          termsFromAi: request.terms
        }
      );
    },
    withdrawOffer: (kind, request) => {
      const withdrawn = kind === "truce" ? socialState.cancelTruce(request.fromPlayerId, request.id) : socialState.cancelAlliance(request.fromPlayerId, request.id);
      if (withdrawn.ok) deps.fanoutPlayerPayloads(withdrawn.payloadsByPlayerId);
    }
  });
  const fetchAiSnapshot = memoizeWithTtl((playerId) => deps.ensureSubscribed(playerId).catch(() => undefined), 3_000);
  const requesterSnapshot = async (playerId: string): Promise<PlayerSubscriptionSnapshot | undefined> =>
    deps.cachedSnapshotForPlayer(playerId) ?? (await deps.ensureSubscribed(playerId));
  const alliesOf = (playerId: string): readonly string[] => socialState.snapshotForPlayer(playerId).allies;
  const diplomacyContext = (requesterId: string, aiPlayerId: string): AiDiplomacyContext => {
    const breaks = socialState.snapshotForPlayer(requesterId).truceBreaksThisSeason;
    return {
      requesterBrokeTruceWithAi: breaks.some((record) => record.targetPlayerId === aiPlayerId),
      requesterTruceBreaksWithOthers: breaks.filter((record) => record.targetPlayerId !== aiPlayerId).length,
      memory: memory.view(aiPlayerId, requesterId),
      now: Date.now(),
      alliesOf
    };
  };
  const reviewAiAlliances = createAiAllianceReview({
    seededAiPlayerIds: deps.seededAiPlayerIds,
    hasLiveSocket: deps.hasLiveSocket,
    alliesOf,
    pendingBreaksOf: (playerId) => socialState.snapshotForPlayer(playerId).activeAllianceBreaks.map((notice) => notice.otherPlayerId),
    fetchAiSnapshot,
    playerName: socialState.playerNameOf,
    breakAlliance: socialState.breakAlliance,
    fanoutPlayerPayloads: deps.fanoutPlayerPayloads,
    recordGatewayEvent: deps.recordGatewayEvent,
    now: () => Date.now()
  });
  const responder = createSeededAiDiplomacyResponder({
    seededAiPlayerIds: deps.seededAiPlayerIds,
    fetchPlayerSnapshot: fetchAiSnapshot,
    requesterSnapshot,
    diplomacyContext,
    hasLiveSocket: deps.hasLiveSocket,
    acceptTruce: acceptance.acceptTruce,
    rejectTruce: socialState.rejectTruce,
    acceptAlliance: acceptance.acceptAlliance,
    rejectAlliance: socialState.rejectAlliance,
    requestTruce: socialState.requestTruce,
    requestAlliance: socialState.requestAlliance,
    syncPlayers: socialState.syncPlayers,
    fanoutPlayerPayloads: deps.fanoutPlayerPayloads,
    recordGatewayEvent: deps.recordGatewayEvent,
    syncTruceToSimulation: deps.syncTruceToSimulation,
    syncAllianceToSimulation: deps.syncAllianceToSimulation
  });

  // Counts every offer the re-offer cooldown blocks (social-offer-cooldowns.ts),
  // so the guard's firing rate is visible in gateway events.
  const withCooldownEvent = <Args extends [string, ...unknown[]]>(
    kind: "truce" | "alliance",
    action: (...args: Args) => ReturnType<SocialState["requestTruce"]>
  ): ((...args: Args) => ReturnType<SocialState["requestTruce"]>) =>
    (...args) => {
      const result = action(...args);
      if (!result.ok && result.code.endsWith("_OFFER_COOLDOWN")) {
        deps.recordGatewayEvent("info", "gateway_diplomacy_offer_cooldown_blocked", { kind, playerId: args[0] });
      }
      return result;
    };
  const requestTruce = withCooldownEvent("truce", socialState.requestTruce);
  const requestAlliance = withCooldownEvent("alliance", socialState.requestAlliance);

  const handleMessage: DiplomacySocketHandler["handleMessage"] = async (message, session, socket) => {
    const playerId = session.playerId;
    if (!playerId) return false;
    if (message.type === "DIPLOMACY_STANCE_REQUEST") {
      const payload = await answerDiplomacyStanceQuery(
        {
          resolvePlayerByName: socialState.resolvePlayerByName,
          isAutoRespondingAi: (targetId) => deps.seededAiPlayerIds.has(targetId) && !deps.hasLiveSocket(targetId),
          fetchAiSnapshot,
          requesterSnapshot,
          diplomacyContext
        },
        playerId,
        message.targetPlayerName
      );
      deps.sendJson(socket, payload);
      return true;
    }
    const guestSession = { isGuest: session.isGuest === true };
    if (
      await handleAllianceSocketMessage(
        {
          requestAlliance: lockedForGuests(guestSession, requestAlliance, deps.gatewayMetrics),
          acceptAlliance: lockedForGuests(guestSession, acceptance.acceptAlliance, deps.gatewayMetrics),
          rejectAlliance: socialState.rejectAlliance,
          cancelAlliance: socialState.cancelAlliance,
          breakAlliance: socialState.breakAlliance,
          sendJson: deps.sendJson,
          fanoutPlayerPayloads: deps.fanoutPlayerPayloads,
          syncAllianceToSimulation: deps.syncAllianceToSimulation,
          maybeAutoRespondToSeededAiAlliance: responder.maybeAutoRespondToSeededAiAlliance,
          sendGameplayEmailAlert: deps.sendGameplayEmailAlert,
          sendAllianceRequestAlert: deps.sendAllianceRequestAlert,
          sendAllianceBreakAlert: deps.sendAllianceBreakAlert,
          onDiplomacyInteraction: (actorId, targetPlayerId) => deps.onDiplomacyInteraction(actorId, targetPlayerId, "alliance")
        },
        message,
        playerId,
        socket
      )
    ) {
      return true;
    }
    return handleTruceSocketMessage(
      {
        requestTruce: lockedForGuests(guestSession, requestTruce, deps.gatewayMetrics),
        acceptTruce: lockedForGuests(guestSession, acceptance.acceptTruce, deps.gatewayMetrics),
        rejectTruce: socialState.rejectTruce,
        cancelTruce: socialState.cancelTruce,
        breakTruce: socialState.breakTruce,
        sendJson: deps.sendJson,
        fanoutPlayerPayloads: deps.fanoutPlayerPayloads,
        syncTruceToSimulation: deps.syncTruceToSimulation,
        maybeAutoRespondToSeededAiTruce: responder.maybeAutoRespondToSeededAiTruce,
        sendGameplayEmailAlert: deps.sendGameplayEmailAlert,
        sendTruceRequestAlert: deps.sendTruceRequestAlert,
        onDiplomacyInteraction: (actorId, targetPlayerId) => deps.onDiplomacyInteraction(actorId, targetPlayerId, "truce")
      },
      message,
      playerId,
      socket
    );
  };
  return {
    handleMessage,
    reviewAiAlliances,
    observeSimulationEvent: (event) => {
      settlement.observe(event);
      const combat = combatFromSimulationEvent(event);
      if (combat) memory.observeCombat(combat);
    }
  };
};
