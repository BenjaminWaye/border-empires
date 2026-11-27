import { emailNotificationPrefsInitFields } from "./handle-set-email-notification-prefs-message.js";
import { hintStateInitFields } from "./handle-set-hint-state-message.js";
import type { StoredPlayerProfile } from "../player-profile-store/player-profile-store.js";
import { profileChangeAllowanceFields } from "../profile-change-allowance/profile-change-allowance.js";

// The per-account fields INIT carries from the stored profile row: hint and
// guide state, email preferences, the Activity "seen" mark, and which of the
// once-per-contest name / colour changes are spent. Extracted from
// gateway-app.ts (over the file-line limit) so it gains no lines.
export const applyInitProfileFields = (
  initMessage: { player: unknown; runtimeIdentity: { seasonId: string } },
  profile: StoredPlayerProfile | undefined
): void => {
  const player = initMessage.player as Record<string, unknown>;
  Object.assign(player, hintStateInitFields(profile));
  player.emailNotificationPrefs = emailNotificationPrefsInitFields(profile?.emailNotificationPrefs);
  Object.assign(player, profileChangeAllowanceFields(profile, initMessage.runtimeIdentity.seasonId));
  (initMessage as Record<string, unknown>).activitySeen = {
    lastActivitySeenAt: profile?.lastActivitySeenAt ?? 0,
    lastActivitySeenSeasonId: profile?.lastActivitySeenSeasonId ?? ""
  };
};
