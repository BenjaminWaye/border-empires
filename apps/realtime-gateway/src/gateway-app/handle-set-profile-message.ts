import { normalizeHex, pickSuggestedPalette } from "../player-color-allocation/player-color-allocation.js";
import { colorPickRejection } from "../player-color-allocation/color-pick-rejection.js";
import { colorsInUseOf } from "../player-color-allocation/taken-color-set.js";
import { displayNameKey, isDisplayNameTaken, suggestAlternativeName } from "../display-name-uniqueness/display-name-uniqueness.js";
import { PROFILE_CHANGE_LIMIT_REASON, profileChangeAllowanceFields } from "../profile-change-allowance/profile-change-allowance.js";

// Extracted from gateway-app.ts's dispatcher switch to keep that (already
// oversized) file from growing -- mirrors handle-set-tile-color-message.ts.
// Validates + persists a SET_PROFILE (display name + color) request, applying
// the once-per-season rename/color-change throttle, then broadcasts the new
// style to every connected player and updates the sender's own HUD state.
// Display names are unique (NAME_TAKEN), like colours (COLOR_TAKEN).

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
  buildTakenNameSet: (excludePlayerId: string) => Promise<Set<string>>;
  incrementDisplayNameCollisionRejectedTotal: () => void;
  runExclusive: <T>(task: () => Promise<T>) => Promise<T>;
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
    buildTakenNameSet, incrementDisplayNameCollisionRejectedTotal, runExclusive,
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
  const rejection = colorUnchanged ? undefined : colorPickRejection(normalized, taken);
  if (rejection) {
    incrementColorCollisionRejectedTotal();
    // colorsInUse: the set this was checked against, so the client re-checks with it.
    sendJson({ type: "ERROR", code: "COLOR_TAKEN", message: rejection.message, suggestion: rejection.suggestion, colorsInUse: colorsInUseOf(taken) });
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
    sendJson({ type: "ERROR", code: "DISPLAY_NAME_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.name });
    return;
  }
  if (isColorChange && currentSeasonId && existingProfile?.colorChangedSeasonId === currentSeasonId) {
    sendJson({ type: "ERROR", code: "COLOR_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.color });
    return;
  }

  const nameChangedSeasonId = isRename ? currentSeasonId : undefined;
  const colorChangedSeasonId = isColorChange ? currentSeasonId : undefined;
  // Grandfathering: a name the player already holds is never re-checked, so
  // duplicates that existed before names became unique keep working (same
  // rule as colorUnchanged above).
  const nameChanged = displayNameKey(existingProfile?.name ?? "") !== displayNameKey(displayName);
  // The uniqueness check and the write it protects must not interleave with
  // another player's SET_PROFILE, so both run inside one exclusive section.
  const saved = await runExclusive(async () => {
    if (nameChanged) {
      const takenNames = await buildTakenNameSet(playerId);
      if (isDisplayNameTaken(displayName, takenNames)) return { takenNames } as const;
    }
    const storedProfile = await profileStore.setProfile(playerId, displayName, normalized, nameChangedSeasonId, colorChangedSeasonId);
    invalidateProfileCache(playerId);
    const saveOverride = profileOverrides.upsert(playerId, {
      ...(storedProfile.name ? { name: storedProfile.name } : {}),
      ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
      ...(typeof storedProfile.profileComplete === "boolean" ? { profileComplete: storedProfile.profileComplete } : {})
    });
    renamePlayer(playerId, saveOverride.name ?? displayName);
    return { override: saveOverride, storedProfile } as const;
  });
  if ("takenNames" in saved) {
    incrementDisplayNameCollisionRejectedTotal();
    sendJson({ type: "ERROR", code: "NAME_TAKEN", message: "That name is already taken by another empire.", suggestion: suggestAlternativeName(displayName, saved.takenNames) });
    return;
  }
  const { override, storedProfile: storedAllowance } = saved;
  const colorsInUse = colorsInUseOf(taken); // before adding the player's own colour: theirs is never "in use" to them
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
      suggestedColors,
      colorsInUse,
      // Which once-per-contest changes are now spent, so the dialog can say so (profile-change-allowance.ts).
      ...(currentSeasonId ? profileChangeAllowanceFields(storedAllowance, currentSeasonId) : {})
    });
  }
};
