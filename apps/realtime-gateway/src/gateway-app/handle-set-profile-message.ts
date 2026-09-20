import { normalizeHex, isTaken, suggestAlternative, pickSuggestedPalette } from "../player-color-allocation/player-color-allocation.js";

// Extracted from gateway-app.ts's dispatcher switch to keep that (already
// oversized) file from growing -- mirrors handle-set-tile-color-message.ts.
// Validates + persists a SET_PROFILE (display name + color) request, applying
// the once-per-season rename/color-change throttle, then broadcasts the new
// style to every connected player and updates the sender's own HUD state.

type StoredProfileLike = {
  name?: string;
  tileColor?: string;
  profileComplete?: boolean;
  nameChangedSeasonId?: string;
  colorChangedSeasonId?: string;
};

export type SetProfileMessageDeps = {
  playerId: string;
  displayName: string;
  color: unknown;
  canToggleFog: boolean;
  buildTakenColorSet: (excludePlayerId: string) => Promise<Set<string>>;
  incrementColorCollisionRejectedTotal: () => void;
  profileStore: {
    get: (playerId: string) => Promise<StoredProfileLike | undefined>;
    setProfile: (
      playerId: string,
      displayName: string,
      tileColor: string,
      nameChangedSeasonId: string | undefined,
      colorChangedSeasonId: string | undefined
    ) => Promise<StoredProfileLike>;
  };
  invalidateProfileCache: (playerId: string) => void;
  profileOverrides: {
    upsert: (
      playerId: string,
      patch: { name?: string; tileColor?: string; profileComplete?: boolean }
    ) => { name?: string; tileColor?: string };
  };
  getCurrentSeasonId: () => Promise<string | undefined>;
  renamePlayer: (playerId: string, name: string) => void;
  sendJson: (payload: unknown) => void;
  allSockets: () => Iterable<unknown>;
  socketsForPlayer: (playerId: string) => Iterable<unknown>;
  queueOrSendSessionPayload: (socket: unknown, payload: unknown) => void;
  preSerializeBroadcast: (payload: Record<string, unknown>) => unknown;
};

export const handleSetProfileMessage = async (deps: SetProfileMessageDeps): Promise<void> => {
  const {
    playerId, displayName, color, canToggleFog, buildTakenColorSet, incrementColorCollisionRejectedTotal,
    profileStore, invalidateProfileCache, profileOverrides, getCurrentSeasonId, renamePlayer, sendJson,
    allSockets, socketsForPlayer, queueOrSendSessionPayload, preSerializeBroadcast
  } = deps;

  const normalized = normalizeHex(typeof color === "string" ? color : "");
  if (!normalized) {
    sendJson({ type: "ERROR", code: "COLOR_INVALID", message: "Color must be a valid hex code (#rrggbb)." });
    return;
  }

  // The client always resends the player's current color alongside a
  // name-only change (SET_PROFILE has no name-only variant). Re-running the
  // collision check against that unchanged color falsely blocks the name
  // update whenever the player's own stored color happens to match another
  // player's (e.g. a pre-existing duplicate from before the uniqueness check
  // existed) -- skip the check when the color isn't actually changing.
  const existingProfile = await profileStore.get(playerId);
  const existingColor = normalizeHex(existingProfile?.tileColor ?? "");
  const colorUnchanged = existingColor !== null && existingColor === normalized;
  const taken = await buildTakenColorSet(playerId);
  if (!colorUnchanged && isTaken(normalized, taken)) {
    const suggestion = suggestAlternative(normalized, taken);
    incrementColorCollisionRejectedTotal();
    sendJson({ type: "ERROR", code: "COLOR_TAKEN", message: "That colour is already taken by another empire.", suggestion });
    return;
  }

  // Renames are throttled to once per season, but the player's initial
  // profile setup (picking their first real name, gated on profileComplete
  // not yet being true) doesn't consume that allowance -- only a rename of an
  // already-complete profile does. Color changes are throttled the same way.
  // Both checks share one season lookup since a single SET_PROFILE call can
  // trigger both at once.
  const isRename = existingProfile?.profileComplete === true && existingProfile.name !== displayName;
  const isColorChange = existingProfile?.profileComplete === true && !colorUnchanged;
  let currentSeasonId: string | undefined;
  if (isRename || isColorChange) {
    currentSeasonId = await getCurrentSeasonId();
  }
  if (isRename && currentSeasonId && existingProfile?.nameChangedSeasonId === currentSeasonId) {
    sendJson({ type: "ERROR", code: "DISPLAY_NAME_LIMIT", message: "You can only change your display name once per season. Try again next season." });
    return;
  }
  if (isColorChange && currentSeasonId && existingProfile?.colorChangedSeasonId === currentSeasonId) {
    sendJson({ type: "ERROR", code: "COLOR_LIMIT", message: "You can only change your empire colour once per season. Try again next season." });
    return;
  }

  const nameChangedSeasonId = isRename ? currentSeasonId : undefined;
  const colorChangedSeasonId = isColorChange ? currentSeasonId : undefined;
  const storedProfile = await profileStore.setProfile(playerId, displayName, normalized, nameChangedSeasonId, colorChangedSeasonId);
  invalidateProfileCache(playerId);
  const override = profileOverrides.upsert(playerId, {
    ...(storedProfile.name ? { name: storedProfile.name } : {}),
    ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
    ...(typeof storedProfile.profileComplete === "boolean" ? { profileComplete: storedProfile.profileComplete } : {})
  });
  renamePlayer(playerId, override.name ?? displayName);
  taken.add(normalized);
  const suggestedColors = pickSuggestedPalette(6, taken);
  const stylePayload = preSerializeBroadcast({ type: "PLAYER_STYLE", playerId, name: override.name ?? displayName, tileColor: override.tileColor ?? normalized });
  for (const targetSocket of allSockets()) queueOrSendSessionPayload(targetSocket, stylePayload);
  for (const targetSocket of socketsForPlayer(playerId)) {
    queueOrSendSessionPayload(targetSocket, {
      type: "PLAYER_UPDATE",
      name: override.name ?? displayName,
      tileColor: override.tileColor ?? normalized,
      profileNeedsSetup: false,
      canToggleFog,
      suggestedColors
    });
  }
};
