import type { ClientMessage } from "@border-empires/shared";
import {
  readIncomingAllianceBreakAlert,
  readIncomingAllianceRequestAlert,
  type EmailAlertOutcome
} from "../email-alerts/email-alerts.js";

type SocialAllianceActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };

export type AllianceSocketMessageDeps = {
  requestAlliance: (fromPlayerId: string, targetPlayerName: string) => SocialAllianceActionResult;
  acceptAlliance: (playerId: string, requestId: string) => SocialAllianceActionResult;
  rejectAlliance: (playerId: string, requestId: string) => SocialAllianceActionResult;
  cancelAlliance: (playerId: string, requestId: string) => SocialAllianceActionResult;
  breakAlliance: (playerId: string, targetPlayerId: string) => SocialAllianceActionResult;
  sendJson: (socket: import("ws").WebSocket, payload: unknown) => void;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
  syncAllianceToSimulation: (input: { playerId: string; targetPlayerId: string; allied: boolean }) => Promise<boolean>;
  sendGameplayEmailAlert: (
    kind: "alliance_request" | "alliance_break",
    recipientPlayerId: string,
    send: () => Promise<EmailAlertOutcome>
  ) => void;
  sendAllianceRequestAlert: (input: { recipientPlayerId: string; senderName: string }) => Promise<EmailAlertOutcome>;
  sendAllianceBreakAlert: (input: { recipientPlayerId: string; senderName: string }) => Promise<EmailAlertOutcome>;
};

const sendError = (
  deps: AllianceSocketMessageDeps,
  socket: import("ws").WebSocket,
  result: Extract<SocialAllianceActionResult, { ok: false }>
): void => deps.sendJson(socket, { type: "ERROR", code: result.code, message: result.message });

/**
 * Handles the ALLIANCE_* client message ladder (REQUEST/ACCEPT/REJECT/CANCEL/BREAK).
 * Returns true if the message was an alliance message (handled or rejected), so the
 * caller can `if (await handleAllianceSocketMessage(...)) return;` instead of
 * repeating the same five near-identical socialState/fanout blocks inline.
 * REQUEST and BREAK additionally email the other player (when they have a bound
 * address) so they don't have to be online to learn about it — see
 * email-alerts.ts for the send/throttle logic.
 */
export const handleAllianceSocketMessage = async (
  deps: AllianceSocketMessageDeps,
  message: ClientMessage,
  playerId: string,
  socket: import("ws").WebSocket
): Promise<boolean> => {
  if (message.type === "ALLIANCE_REQUEST") {
    const result = deps.requestAlliance(playerId, message.targetPlayerName);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    const alert = readIncomingAllianceRequestAlert(result.payloadsByPlayerId);
    if (alert) {
      deps.sendGameplayEmailAlert("alliance_request", alert.recipientPlayerId, () =>
        deps.sendAllianceRequestAlert({ recipientPlayerId: alert.recipientPlayerId, senderName: alert.senderName })
      );
    }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "ALLIANCE_ACCEPT") {
    const result = deps.acceptAlliance(playerId, message.requestId);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    const allyPlayerId = result.notifyPlayerIds.find((id) => id !== playerId);
    if (allyPlayerId) void deps.syncAllianceToSimulation({ playerId, targetPlayerId: allyPlayerId, allied: true });
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "ALLIANCE_REJECT") {
    const result = deps.rejectAlliance(playerId, message.requestId);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "ALLIANCE_CANCEL") {
    const result = deps.cancelAlliance(playerId, message.requestId);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  if (message.type === "ALLIANCE_BREAK") {
    const result = deps.breakAlliance(playerId, message.targetPlayerId);
    if (!result.ok) { sendError(deps, socket, result); return true; }
    const breakAlert = readIncomingAllianceBreakAlert(result.payloadsByPlayerId);
    if (breakAlert) {
      deps.sendGameplayEmailAlert("alliance_break", breakAlert.recipientPlayerId, () =>
        deps.sendAllianceBreakAlert({ recipientPlayerId: breakAlert.recipientPlayerId, senderName: breakAlert.senderName })
      );
    }
    deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    return true;
  }
  return false;
};
