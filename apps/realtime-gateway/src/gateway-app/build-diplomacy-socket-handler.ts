// Wires the ALLIANCE_* / TRUCE_* socket handlers and the seeded-AI
// diplomacy responder, extracted out of gateway-app.ts (well over the repo's
// 500-line file-size gate and may not grow further -- see AGENTS.md's
// file-and-type-discipline rule).
import type { ClientMessage } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { WebSocket } from "ws";

import { handleAllianceSocketMessage, type AllianceSocketMessageDeps } from "../alliance-socket-messages/alliance-socket-messages.js";
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
};

export type DiplomacySocketHandler = (
  message: ClientMessage,
  session: { playerId?: string | undefined; isGuest?: boolean | undefined },
  socket: WebSocket
) => Promise<boolean>;

export const buildDiplomacySocketHandler = (deps: DiplomacySocketHandlerDeps): DiplomacySocketHandler => {
  const { socialState } = deps;
  const responder = createSeededAiDiplomacyResponder({
    seededAiPlayerIds: deps.seededAiPlayerIds,
    fetchPlayerSnapshot: memoizeWithTtl((playerId) => deps.ensureSubscribed(playerId).catch(() => undefined), 3_000),
    requesterSnapshot: async (playerId) => deps.cachedSnapshotForPlayer(playerId) ?? (await deps.ensureSubscribed(playerId)),
    requesterBrokeTruceWith: (requesterId, aiPlayerId) =>
      socialState.snapshotForPlayer(requesterId).truceBreaksThisSeason.some((record) => record.targetPlayerId === aiPlayerId),
    hasLiveSocket: deps.hasLiveSocket,
    acceptTruce: socialState.acceptTruce,
    rejectTruce: socialState.rejectTruce,
    acceptAlliance: socialState.acceptAlliance,
    rejectAlliance: socialState.rejectAlliance,
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

  return async (message, session, socket) => {
    const playerId = session.playerId;
    if (!playerId) return false;
    const guestSession = { isGuest: session.isGuest === true };
    if (
      await handleAllianceSocketMessage(
        {
          requestAlliance: lockedForGuests(guestSession, requestAlliance, deps.gatewayMetrics),
          acceptAlliance: lockedForGuests(guestSession, socialState.acceptAlliance, deps.gatewayMetrics),
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
        acceptTruce: lockedForGuests(guestSession, socialState.acceptTruce, deps.gatewayMetrics),
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
};
