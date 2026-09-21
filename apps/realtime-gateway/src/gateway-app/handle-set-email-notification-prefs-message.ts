import type { EmailNotificationPrefs } from "../player-profile-store/player-profile-store.js";

// Persists a player's per-category email-notification opt-out (see
// email-alerts.ts's per-send prefs check and player-profile-store.ts's
// emailNotificationPrefs) on the gateway's player-profile row, mirroring
// handle-set-hint-state-message.ts's SET_HINT_STATE pattern. Every category
// defaults to on -- only an explicit `false` in the patch disables it.

const EMAIL_NOTIFICATION_CATEGORIES = [
  "allianceRequest",
  "allianceBreak",
  "truceOffer",
  "attackAlert",
  "aetherPurgeAlert",
  "seasonStart"
] as const;

export type SetEmailNotificationPrefsMessageDeps = {
  playerId: string;
  prefs: unknown;
  profileStore: {
    setEmailNotificationPrefs: (playerId: string, patch: EmailNotificationPrefs) => Promise<{ emailNotificationPrefs?: EmailNotificationPrefs }>;
  };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
};

const sanitizePrefsPatch = (prefs: unknown): EmailNotificationPrefs => {
  if (!prefs || typeof prefs !== "object") return {};
  const patch: EmailNotificationPrefs = {};
  for (const category of EMAIL_NOTIFICATION_CATEGORIES) {
    const value = (prefs as Record<string, unknown>)[category];
    if (typeof value === "boolean") patch[category] = value;
  }
  return patch;
};

/** Every category's resolved on/off state, defaulting to true (opt-out model) for anything not yet stored. */
export const emailNotificationPrefsInitFields = (
  stored: EmailNotificationPrefs | undefined
): Required<EmailNotificationPrefs> => ({
  allianceRequest: stored?.allianceRequest ?? true,
  allianceBreak: stored?.allianceBreak ?? true,
  truceOffer: stored?.truceOffer ?? true,
  attackAlert: stored?.attackAlert ?? true,
  aetherPurgeAlert: stored?.aetherPurgeAlert ?? true,
  seasonStart: stored?.seasonStart ?? true
});

export const handleSetEmailNotificationPrefsMessage = async (deps: SetEmailNotificationPrefsMessageDeps): Promise<void> => {
  const { playerId, prefs, profileStore, invalidateProfileCache, sendJson } = deps;
  const patch = sanitizePrefsPatch(prefs);
  const updated = await profileStore.setEmailNotificationPrefs(playerId, patch);
  invalidateProfileCache(playerId);
  sendJson({ type: "EMAIL_NOTIFICATION_PREFS_SET", prefs: emailNotificationPrefsInitFields(updated.emailNotificationPrefs) });
};
