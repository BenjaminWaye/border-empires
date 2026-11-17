// The simulation's PLAYER_RESPAWNED message (runtime-respawn-helpers.ts
// finalizeRespawnNotice): Slack ops alert for every respawn, plus the "empire
// fell" email when a player was conquered (not on their own withdrawal, and
// not for account/startup recovery). Extracted from gateway-app.ts.
import type { EmailAlertOutcome } from "../email-alerts/email-alerts.js";
import type { EmpireFellAlertInput } from "../email-alerts/email-alert-inputs.js";
import type { SendGameplayEmailAlert } from "../gameplay-email-alert/gameplay-email-alert.js";

export type EmpireFell = { recipientPlayerId: string; captorId?: string; x: number; y: number };

/** A conquest elimination with a known landing tile, or undefined. */
export const readEmpireFell = (playerId: string, payload: Record<string, unknown>): EmpireFell | undefined => {
  if (payload.reason !== "eliminated" || payload.withdrawn === true) return undefined;
  const { x, y } = payload;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const captorId = typeof payload.fellToPlayerId === "string" && payload.fellToPlayerId.length > 0 ? payload.fellToPlayerId : undefined;
  return { recipientPlayerId: playerId, x, y, ...(captorId ? { captorId } : {}) };
};

/** Barbarians have no display name of their own. */
export const captorDisplayName = (captorId: string, nameOf: (playerId: string) => string): string =>
  captorId.startsWith("barbarian") ? "the barbarians" : nameOf(captorId);

export type PlayerRespawnedDeps = {
  alertPlayerRespawned?: (playerId: string, reason: string) => void;
  nameOf: (playerId: string) => string;
  sendEmpireFellAlert: (input: EmpireFellAlertInput) => Promise<EmailAlertOutcome>;
  sendGameplayEmailAlert: SendGameplayEmailAlert;
};

export const handlePlayerRespawned = (playerId: string, payload: Record<string, unknown>, deps: PlayerRespawnedDeps): void => {
  deps.alertPlayerRespawned?.(playerId, typeof payload.reason === "string" ? payload.reason : "unknown");
  const fell = readEmpireFell(playerId, payload);
  if (!fell) return;
  const captorName = fell.captorId ? captorDisplayName(fell.captorId, deps.nameOf) : undefined;
  deps.sendGameplayEmailAlert("empire_fell", playerId, () =>
    deps.sendEmpireFellAlert({ recipientPlayerId: playerId, x: fell.x, y: fell.y, ...(captorName ? { captorName } : {}) })
  );
};
