// Shared relay for the two "you were struck" PLAYER_MESSAGE side-events that
// carry a display name needing live-profile hydration and (throttled,
// shared with each other) an email alert: ATTACK_ALERT and AETHER_PURGE_ALERT.
// Extracted out of gateway-app.ts to keep that already-oversized file from
// growing (see AGENTS.md's file-line-limit rule) when AETHER_PURGE_ALERT was
// added alongside the pre-existing ATTACK_ALERT handling.
import { readAetherPurgeAlert, readAttackAlert, type EmailAlertService } from "../email-alerts/email-alerts.js";
import { hydrateAndRecoverPlayerMessage } from "../live-world-status-recovery.js";
import { withTimeout } from "../promise-timeout.js";
import type { SendGameplayEmailAlert } from "../gameplay-email-alert/gameplay-email-alert.js";
import type { PlayerProfileOverrides } from "../player-profile-overrides.js";
import type { GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";

export type AttackAlertLikeMessageType = "ATTACK_ALERT" | "AETHER_PURGE_ALERT";

export const isAttackAlertLikeMessage = (messageType: string): messageType is AttackAlertLikeMessageType =>
  messageType === "ATTACK_ALERT" || messageType === "AETHER_PURGE_ALERT";

/**
 * Hydrates the caster's live display name into `payload` (needed for the
 * email alert even when the defender is offline), then -- for the messages
 * this module owns -- sends the matching throttled email. Returns the
 * hydrated payload so the caller can still relay it to a connected defender.
 */
export const handleAttackAlertLikePlayerMessage = async (
  messageType: AttackAlertLikeMessageType,
  payload: Record<string, unknown>,
  deps: {
    defenderPlayerId: string;
    profileStore: GatewayPlayerProfileStore;
    profileOverrides: PlayerProfileOverrides;
    liveProfileHydrationTimeoutMs: number;
    emailAlerts: EmailAlertService;
    sendGameplayEmailAlert: SendGameplayEmailAlert;
    onHydrateError: (error: unknown) => void;
  }
): Promise<Record<string, unknown>> => {
  const hydratedPayload = await hydrateAndRecoverPlayerMessage(payload, deps.profileStore, deps.profileOverrides, {
    timeoutMs: deps.liveProfileHydrationTimeoutMs,
    withTimeout,
    onError: deps.onHydrateError
  });
  if (messageType === "ATTACK_ALERT") {
    const attackAlert = readAttackAlert(hydratedPayload);
    if (attackAlert) {
      deps.sendGameplayEmailAlert("attack", deps.defenderPlayerId, () =>
        deps.emailAlerts.sendAttackAlert({ defenderPlayerId: deps.defenderPlayerId, attackerName: attackAlert.attackerName, x: attackAlert.x, y: attackAlert.y })
      );
    }
  } else {
    const aetherPurgeAlert = readAetherPurgeAlert(hydratedPayload);
    if (aetherPurgeAlert) {
      // "attack" kind reused deliberately: shares sendAttackAlert's per-recipient
      // throttle, so this is the same one-email-an-hour bucket as conventional
      // attacks, not an additional one.
      deps.sendGameplayEmailAlert("attack", deps.defenderPlayerId, () =>
        deps.emailAlerts.sendAetherPurgeAlert({ defenderPlayerId: deps.defenderPlayerId, attackerName: aetherPurgeAlert.attackerName, x: aetherPurgeAlert.x, y: aetherPurgeAlert.y })
      );
    }
  }
  return hydratedPayload;
};
