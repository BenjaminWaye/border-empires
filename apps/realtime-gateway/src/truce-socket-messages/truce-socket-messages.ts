import type { ClientMessage, DiplomacyTerms } from "@border-empires/shared";
import { offerOptionsFor } from "../diplomacy-offer-options/diplomacy-offer-options.js";
import { readIncomingTruceRequestAlert, type EmailAlertOutcome } from "../email-alerts/email-alerts.js";
import { extractTruceRequestFromPayloads } from "../seeded-ai-diplomacy-responder/seeded-ai-diplomacy-responder.js";
import type { SocialTruceRequest } from "../social-state/social-state.js";

type SocialTruceActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };

export type TruceSocketMessageDeps = {
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24, options?: { terms?: DiplomacyTerms }) => SocialTruceActionResult;
  /** Async when the offer carries terms the simulation must pay out first. */
  acceptTruce: (playerId: string, requestId: string) => SocialTruceActionResult | Promise<SocialTruceActionResult>;
  rejectTruce: (playerId: string, requestId: string) => SocialTruceActionResult;
  cancelTruce: (playerId: string, requestId: string) => SocialTruceActionResult;
  breakTruce: (playerId: string, targetPlayerId: string) => SocialTruceActionResult;
  /** Fresh ALLIANCE_UPDATE/TRUCE_UPDATE payloads for the given players (socialState.syncPlayers). */
  syncPlayers: (playerIds: string[]) => { payloadsByPlayerId: Map<string, unknown[]> };
  /** Payloads for everyone else still showing a dropped offer (socialState.takeStaleOfferSync). */
  takeStaleOfferSync: () => { payloadsByPlayerId: Map<string, unknown[]> } | undefined;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  syncTruceToSimulation: (input: { playerId: string; targetPlayerId: string; truced: boolean }) => Promise<boolean>;
  maybeAutoRespondToSeededAiTruce: (request: SocialTruceRequest | undefined) => Promise<void>;
  sendGameplayEmailAlert: (kind: "truce_request", recipientPlayerId: string, send: () => Promise<EmailAlertOutcome>) => void;
  sendTruceRequestAlert: (input: { recipientPlayerId: string; senderName: string; durationHours: 12 | 24 }) => Promise<EmailAlertOutcome>;
  // Player-funnel hook (player-funnel-tracker.ts): fired for a successful
  // REQUEST or ACCEPT with the other player's id.
  onDiplomacyInteraction?: (playerId: string, targetPlayerId: string | undefined) => void;
};

const sendError = (deps: TruceSocketMessageDeps, socket: import("ws").WebSocket, result: Extract<SocialTruceActionResult, { ok: false }>): void =>
  deps.sendJson(socket, { type: "ERROR", code: result.code, message: result.message });

// Failures that mean the client is showing an offer the server already dropped:
// expired offers are pruned silently, and a failed accept can delete the request.
const STALE_OFFER_CODES: ReadonlySet<string> = new Set(["TRUCE_REQUEST_INVALID", "TRUCE_LOCKED_OUT", "TRUCE_EXISTS"]);

// After such a failure, resend the actor's truce state so the stale card goes,
// and flush the other side of any offer the server just dropped.
const sendErrorAndResync = (
  deps: TruceSocketMessageDeps,
  socket: import("ws").WebSocket,
  result: Extract<SocialTruceActionResult, { ok: false }>,
  playerId: string
): void => {
  sendError(deps, socket, result);
  if (!STALE_OFFER_CODES.has(result.code)) return;
  deps.fanoutPlayerPayloads(deps.syncPlayers([playerId]).payloadsByPlayerId);
  const stale = deps.takeStaleOfferSync();
  if (stale) deps.fanoutPlayerPayloads(stale.payloadsByPlayerId);
};

/**
 * Handles the TRUCE_* client message ladder (REQUEST/ACCEPT/REJECT/CANCEL/BREAK).
 * Returns true if the message was a truce message (handled or rejected), so the
 * caller can `if (await handleTruceSocketMessage(...)) return;` instead of
 * repeating the same five near-identical socialState/fanout blocks inline.
 * ACCEPT/BREAK additionally sync the truce to the simulation runtime — see
 * truce-simulation-sync.ts for why this is required (SYNC_TRUCE gates
 * combat/observatory actions server-side; without it truces are cosmetic).
 */
export const handleTruceSocketMessage = async (
  deps: TruceSocketMessageDeps,
  message: ClientMessage,
  playerId: string,
  socket: import("ws").WebSocket
): Promise<boolean> => {
  if (message.type === "TRUCE_REQUEST") {
    const result = deps.requestTruce(playerId, message.targetPlayerName, message.durationHours, offerOptionsFor(message));
    if (!result.ok) { sendError(deps, socket, result); return true; }
    deps.onDiplomacyInteraction?.(playerId, result.notifyPlayerIds.find((id) => id !== playerId));
    const alert = readIncomingTruceRequestAlert(result.payloadsByPlayerId);
    if (alert) {
      deps.sendGameplayEmailAlert("truce_request", alert.recipientPlayerId, () =>
        deps.sendTruceRequestAlert({ recipientPlayerId: alert.recipientPlayerId, senderName: alert.senderName, durationHours: alert.durationHours })
      );
    }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    await deps.maybeAutoRespondToSeededAiTruce(extractTruceRequestFromPayloads(result.payloadsByPlayerId, playerId));
    return true;
  }
  if (message.type === "TRUCE_ACCEPT") {
    const result = await deps.acceptTruce(playerId, message.requestId);
    if (!result.ok) { sendErrorAndResync(deps, socket, result, playerId); return true; }
    deps.onDiplomacyInteraction?.(playerId, result.notifyPlayerIds.find((id) => id !== playerId));
    const targetPlayerId = result.notifyPlayerIds.find((id) => id !== playerId);
    if (targetPlayerId) await deps.syncTruceToSimulation({ playerId, targetPlayerId, truced: true });
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "TRUCE_REJECT") {
    const result = deps.rejectTruce(playerId, message.requestId);
    if (!result.ok) { sendErrorAndResync(deps, socket, result, playerId); return true; }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "TRUCE_CANCEL") {
    const result = deps.cancelTruce(playerId, message.requestId);
    if (!result.ok) { sendErrorAndResync(deps, socket, result, playerId); return true; }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "TRUCE_BREAK") {
    const result = deps.breakTruce(playerId, message.targetPlayerId);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    await deps.syncTruceToSimulation({ playerId, targetPlayerId: message.targetPlayerId, truced: false });
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  return false;
};
