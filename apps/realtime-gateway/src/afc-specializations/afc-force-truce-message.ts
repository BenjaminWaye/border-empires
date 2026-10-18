import type { ClientMessage } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { SocialState } from "../social-state/social-state.js";
import type { TruceSocketMessageDeps } from "../truce-socket-messages/truce-socket-messages.js";

interface AfcCourtMessageDeps<TSocket> {
  socialState: SocialState;
  ensureSubscribed: (playerId: string) => Promise<PlayerSubscriptionSnapshot>;
  syncTruceToSimulation: TruceSocketMessageDeps["syncTruceToSimulation"];
  fanoutPlayerPayloads: (payloads: Map<string, unknown[]>) => void;
  sendJson: (socket: TSocket, payload: unknown) => void;
}
/** Gateway owns the durable agreement and cooldown; the sim still owns upgrade eligibility. */
export async function handleAfcCourtMessage<TSocket>(deps: AfcCourtMessageDeps<TSocket>, message: ClientMessage, session: { playerId?: string | undefined; isGuest?: boolean | undefined }, socket: TSocket): Promise<boolean> {
  if (message.type !== "FORCE_TRUCE" || !session.playerId) return false;
  const error = (code: string, text: string): void => deps.sendJson(socket, { type: "ERROR", code, message: text });
  if (session.isGuest) { error("GUEST_DIPLOMACY_LOCKED", "Save your House to use diplomacy."); return true; }
  const snapshot = await deps.ensureSubscribed(session.playerId);
  if (!snapshot.player?.domainIds.includes("afc-chancery-4")) { error("AFC_UPGRADE_REQUIRED", "requires Court Armistice Mandate"); return true; }
  const result = deps.socialState.forceTruce(session.playerId, message.targetPlayerId);
  if (!result.ok) { error(result.code, result.message); return true; }
  // Normal truce synchronization also restores enforcement after gateway/sim reconnect.
  await deps.syncTruceToSimulation({ playerId: session.playerId, targetPlayerId: message.targetPlayerId, truced: true });
  deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
  return true;
}
