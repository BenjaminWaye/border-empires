import { handleAfcCourtMessage } from "../afc-specializations/afc-force-truce-message.js";
import { createProactiveAiDiplomacy } from "../proactive-ai-diplomacy/proactive-ai-diplomacy.js";
// Wires the ALLIANCE_* / TRUCE_* socket handlers, the trade screen's stance
// query, deal settlement, and the seeded-AI diplomacy responder, extracted out of gateway-app.ts (well over the repo's
// 500-line file-size gate and may not grow further -- see AGENTS.md's
// file-and-type-discipline rule).
import { netValueToAi, SHARD_COIN_VALUE, type ClientMessage } from "@border-empires/shared";
import type { CommandEnvelope, PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { WebSocket } from "ws";

import { combatFromSimulationEvent, createAiDiplomacyMemory } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import type { LeaderboardTiles } from "../ai-diplomacy-stance/ai-alliance-bloc.js";
import { createAiAllianceReview } from "../ai-diplomacy-stance/ai-alliance-review.js";
import { recheckAiOffer } from "../ai-diplomacy-stance/ai-offer-recheck.js";
import type { AiDiplomacyContext } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";
import { answerDiplomacyStanceQuery } from "../ai-diplomacy-stance/diplomacy-stance-query.js";
import { createSeasonLeaderboardCache } from "../ai-diplomacy-stance/season-leaderboard-cache.js";
import { createAllianceBreakFinalizer } from "../alliance-break-finalizer/alliance-break-finalizer.js";
import { handleAllianceSocketMessage, type AllianceSocketMessageDeps } from "../alliance-socket-messages/alliance-socket-messages.js";
import { rejectCounteredOffer } from "../diplomacy-counter-offer/diplomacy-counter-offer.js";
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
  /** Every competitive player's tile count, from the simulation's cached season summary. */
  fetchSeasonLeaderboard: () => Promise<LeaderboardTiles>;
};

export type DiplomacySocketHandler = {
  tickProactive: () => Promise<void>;
  stopProactive: () => void;
  handleMessage: (
    message: ClientMessage,
    session: { playerId?: string | undefined; isGuest?: boolean | undefined },
    socket: WebSocket
  ) => Promise<boolean>;
  /**
   * Recurring alliance upkeep (call every minute): finalizes break notices
   * whose 24h ran out, has AIs leave alliances they no longer lead
   * (self-throttled to every 5 minutes), and tells both sides of any truce
   * offer that expired or was dropped since the last run.
   */
  runAllianceMaintenance: () => void;
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
  // AI snapshots come from a live subscribe without world status, so the bloc
  // check's sizes come from the season leaderboard (cached, bounded wait).
  const seasonLeaderboard = createSeasonLeaderboardCache({ fetch: deps.fetchSeasonLeaderboard, now: () => Date.now() });
  const diplomacyContext = async (requesterId: string, aiPlayerId: string): Promise<AiDiplomacyContext> => {
    const breaks = socialState.snapshotForPlayer(requesterId).truceBreaksThisSeason;
    const leaderboard = await seasonLeaderboard();
    return {
      requesterBrokeTruceWithAi: breaks.some((record) => record.targetPlayerId === aiPlayerId),
      requesterTruceBreaksWithOthers: breaks.filter((record) => record.targetPlayerId !== aiPlayerId).length,
      memory: memory.view(aiPlayerId, requesterId),
      now: Date.now(),
      alliesOf,
      ...(leaderboard ? { seasonLeaderboard: leaderboard } : {})
    };
  };
  const reviewAiAlliances = createAiAllianceReview({
    seededAiPlayerIds: deps.seededAiPlayerIds,
    hasLiveSocket: deps.hasLiveSocket,
    alliesOf,
    pendingBreaksOf: (playerId) => socialState.snapshotForPlayer(playerId).activeAllianceBreaks.map((notice) => notice.otherPlayerId),
    fetchLeaderboard: deps.fetchSeasonLeaderboard,
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

  const proactive = createProactiveAiDiplomacy({ socialState, aiPlayerIds: deps.seededAiPlayerIds,
    syncForcedTruce: async (playerId, targetPlayerId) => { await deps.syncTruceToSimulation({ playerId, targetPlayerId, truced: true }); },
    fetchSnapshot: requesterSnapshot, hasLiveSocket: deps.hasLiveSocket, responder,
    fanout: deps.fanoutPlayerPayloads, recordEvent: deps.recordGatewayEvent,
    nameForPlayerId: async id => socialState.playerNameOf(id), diplomacyContext });

  const handleMessage: DiplomacySocketHandler["handleMessage"] = async (message, session, socket) => {
    const playerId = session.playerId;
    if (!playerId) return false;
    if (await handleAfcCourtMessage(deps, message, session, socket)) return true;
    if (message.type === "DIPLOMACY_STANCE_REQUEST") {
      const payload = await answerDiplomacyStanceQuery(
        {
          resolvePlayerByName: socialState.resolvePlayerByName,
          resolvePlayerById: socialState.resolvePlayerById,
          isAutoRespondingAi: (targetId) => deps.seededAiPlayerIds.has(targetId) && !deps.hasLiveSocket(targetId),
          fetchAiSnapshot,
          requesterSnapshot,
          diplomacyContext
        },
        playerId,
        message.targetPlayerName,
        message.targetPlayerId
      );
      deps.sendJson(socket, payload);
      return true;
    }
    const guestSession = { isGuest: session.isGuest === true };
    // Guests can't send offers, so a counter from one must not reject anything.
    if (!guestSession.isGuest) rejectCounteredOffer({ rejectTruce: socialState.rejectTruce, rejectAlliance: socialState.rejectAlliance, fanoutPlayerPayloads: deps.fanoutPlayerPayloads }, message, playerId);
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
        syncPlayers: socialState.syncPlayers,
        takeStaleOfferSync: socialState.takeStaleOfferSync,
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
  const finalizeExpiredAllianceBreaks = createAllianceBreakFinalizer({
    socialState,
    syncAllianceToSimulation: deps.syncAllianceToSimulation,
    fanoutPlayerPayloads: deps.fanoutPlayerPayloads
  });
  return {
    tickProactive: proactive.tick,
    stopProactive: proactive.stop,
    handleMessage,
    runAllianceMaintenance: () => {
      void finalizeExpiredAllianceBreaks();
      void reviewAiAlliances();
      const staleOffers = socialState.takeStaleOfferSync();
      if (staleOffers) deps.fanoutPlayerPayloads(staleOffers.payloadsByPlayerId);
    },
    observeSimulationEvent: (event) => {
      settlement.observe(event);
      const combat = combatFromSimulationEvent(event);
      if (combat) memory.observeCombat(combat);
    }
  };
};
