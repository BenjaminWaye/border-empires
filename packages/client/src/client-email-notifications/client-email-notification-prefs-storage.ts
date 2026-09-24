// Tracks the player's per-category email-notification opt-out
// (SET_EMAIL_NOTIFICATION_PREFS / EMAIL_NOTIFICATION_PREFS_SET in
// messages.ts, player-profile-store.ts's emailNotificationPrefs). Unlike the
// discovery-tips hint state, this setting has no useful pre-connection
// default beyond "everything on" (the opt-out model matches the server's
// always-on-until-toggled-off behavior), so it's kept as simple in-memory
// state hydrated from the gateway rather than mirrored into localStorage --
// mirrors client-hint-server-sync.ts's send-side wiring without a
// localStorage-backed read side.

export type EmailNotificationCategory =
  | "allianceRequest"
  | "allianceBreak"
  | "truceOffer"
  | "attackAlert"
  | "aetherPurgeAlert"
  | "seasonStart"
  | "manpowerFull";

export type EmailNotificationPrefs = Record<EmailNotificationCategory, boolean>;

const ALL_ON: EmailNotificationPrefs = {
  allianceRequest: true,
  allianceBreak: true,
  truceOffer: true,
  attackAlert: true,
  aetherPurgeAlert: true,
  seasonStart: true,
  manpowerFull: true
};

let currentPrefs: EmailNotificationPrefs = { ...ALL_ON };
let sendPrefsMessage: ((patch: Partial<EmailNotificationPrefs>) => void) | undefined;

/** Called once from client-network.ts wiring with the real WebSocket send function. */
export const registerEmailNotificationPrefsSender = (send: (patch: Partial<EmailNotificationPrefs>) => void): void => {
  sendPrefsMessage = send;
};

export const getEmailNotificationPrefs = (): EmailNotificationPrefs => ({ ...currentPrefs });

/** Reconciles the gateway's INIT/EMAIL_NOTIFICATION_PREFS_SET payload into local state. Missing categories stay whatever they already were (default on). */
export const applyEmailNotificationPrefsFromServer = (prefs: Record<string, unknown> | undefined): void => {
  if (!prefs) return;
  const next = { ...currentPrefs };
  for (const category of Object.keys(ALL_ON) as EmailNotificationCategory[]) {
    const value = prefs[category];
    if (typeof value === "boolean") next[category] = value;
  }
  currentPrefs = next;
};

/** Optimistically updates local state and syncs the change to the gateway. No-ops the send until a sender is registered (e.g. before the socket connects) -- state still updates locally and the next toggle will resync. */
export const setEmailNotificationPref = (category: EmailNotificationCategory, enabled: boolean): void => {
  currentPrefs = { ...currentPrefs, [category]: enabled };
  sendPrefsMessage?.({ [category]: enabled });
};
