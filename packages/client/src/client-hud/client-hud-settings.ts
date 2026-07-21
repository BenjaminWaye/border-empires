import { updateProfile, type Auth } from "firebase/auth";
import type { FeedSeverity, FeedType } from "../client-types.js";

// Firebase's own displayName is best-effort/secondary here — the game server's
// SET_PROFILE call is the source of truth for what other players see.
export const updateFirebaseDisplayNameBestEffort = async (firebaseAuth: Auth | null | undefined, name: string): Promise<void> => {
  if (!firebaseAuth?.currentUser || firebaseAuth.currentUser.displayName === name) return;
  try {
    await updateProfile(firebaseAuth.currentUser, { displayName: name });
  } catch {
    // Ignore — the game server SET_PROFILE call is authoritative.
  }
};

export interface UpdateSettingsDisplayNameDeps {
  currentName: string;
  // The player's existing tile color, forwarded unchanged. SET_PROFILE
  // requires a valid color on every call — the gateway normalizes
  // message.color unconditionally, so omitting it (display-name-only
  // intent) throws/rejects server-side instead of updating just the name.
  currentColor: string;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  updateFirebaseDisplayName: (name: string) => Promise<void>;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  // Records the in-flight name so client-network can confirm success (on the
  // matching PLAYER_UPDATE) or report failure (on a SET_PROFILE ERROR)
  // instead of this function assuming success the instant the socket send
  // succeeds — the gateway can still reject the whole message server-side.
  setPendingDisplayNameChange: (name: string) => void;
}

export const updateSettingsDisplayName = async (rawName: string, deps: UpdateSettingsDisplayNameDeps): Promise<void> => {
  const newName = rawName.trim();
  if (newName.length < 2) {
    deps.pushFeed("Display name must be at least 2 characters.", "error", "warn");
    return;
  }
  if (newName === deps.currentName) {
    deps.pushFeed("Display name is unchanged.", "info", "info");
    return;
  }
  deps.setPendingDisplayNameChange(newName);
  const sent = deps.sendGameMessage(
    { type: "SET_PROFILE", displayName: newName, color: deps.currentColor },
    "Finish sign-in before changing your display name."
  );
  if (!sent) {
    deps.setPendingDisplayNameChange("");
    deps.pushFeed("Could not update display name. Finish sign-in and try again.", "error", "warn");
    return;
  }
  await deps.updateFirebaseDisplayName(newName);
};
