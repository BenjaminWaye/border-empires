import { normalizeHex } from "../player-color-allocation/player-color-allocation.js";
import { colorPickRejection } from "../player-color-allocation/color-pick-rejection.js";
import { pickSuggestedPalette } from "../player-color-allocation/player-color-allocation.js";
import { PROFILE_CHANGE_LIMIT_REASON, profileChangeUsed } from "../profile-change-allowance/profile-change-allowance.js";

// Extracted from gateway-app.ts's dispatcher switch to keep that (already
// oversized) file from growing -- mirrors handle-set-country-flag-message.ts.
// Validates + persists a SET_TILE_COLOR request, then broadcasts the new
// color to every connected player and updates the sender's own HUD state.
// A colour change of a set-up profile spends the once-per-contest colour
// allowance, exactly as SET_PROFILE does (profile-change-allowance.ts): this
// message used to skip that check.
export type SetTileColorMessageDeps = {
  playerId: string;
  color: unknown;
  canToggleFog: boolean;
  buildTakenColorSet: (excludePlayerId: string) => Promise<Set<string>>;
  incrementColorCollisionRejectedTotal: () => void;
  profileStore: {
    get: (playerId: string) => Promise<{ tileColor?: string; profileComplete?: boolean; colorChangedSeasonId?: string } | undefined>;
    setTileColor: (playerId: string, tileColor: string, colorChangedSeasonId?: string) => Promise<{ name?: string; tileColor?: string; profileComplete?: boolean }>;
  };
  getCurrentSeasonId: () => Promise<string | undefined>;
  invalidateProfileCache: (playerId: string) => void;
  profileOverrides: { upsert: (playerId: string, patch: { name?: string; tileColor?: string; profileComplete?: boolean }) => { name?: string; tileColor?: string } };
  sendJson: (payload: unknown) => void;
  allSockets: () => Iterable<unknown>;
  socketsForPlayer: (playerId: string) => Iterable<unknown>;
  queueOrSendSessionPayload: (socket: unknown, payload: unknown) => void;
};

export const handleSetTileColorMessage = async (deps: SetTileColorMessageDeps): Promise<void> => {
  const {
    playerId, color, canToggleFog, buildTakenColorSet, incrementColorCollisionRejectedTotal,
    profileStore, invalidateProfileCache, profileOverrides, getCurrentSeasonId, sendJson, allSockets, socketsForPlayer, queueOrSendSessionPayload
  } = deps;
  const normalized = normalizeHex(typeof color === "string" ? color : "");
  if (!normalized) {
    sendJson({ type: "ERROR", code: "COLOR_INVALID", message: "Color must be a valid hex code (#rrggbb)." });
    return;
  }
  const existing = await profileStore.get(playerId);
  // Re-saving the colour already held is not a change and spends nothing.
  const colorChanging = normalizeHex(existing?.tileColor ?? "") !== normalized;
  const seasonId = colorChanging && existing?.profileComplete === true ? await getCurrentSeasonId() : undefined;
  if (profileChangeUsed(existing?.colorChangedSeasonId, seasonId)) {
    sendJson({ type: "ERROR", code: "COLOR_LIMIT", message: PROFILE_CHANGE_LIMIT_REASON.color });
    return;
  }
  const taken = await buildTakenColorSet(playerId);
  const rejection = colorPickRejection(normalized, taken);
  if (rejection) {
    incrementColorCollisionRejectedTotal();
    sendJson({ type: "ERROR", code: "COLOR_TAKEN", message: rejection.message, suggestion: rejection.suggestion });
    return;
  }
  const storedProfile = await profileStore.setTileColor(playerId, normalized, seasonId);
  invalidateProfileCache(playerId);
  const override = profileOverrides.upsert(playerId, {
    ...(storedProfile.name ? { name: storedProfile.name } : {}),
    ...(storedProfile.tileColor ? { tileColor: storedProfile.tileColor } : {}),
    ...(typeof storedProfile.profileComplete === "boolean" ? { profileComplete: storedProfile.profileComplete } : {})
  });
  taken.add(normalized);
  const suggestedColors = pickSuggestedPalette(6, taken);
  const stylePayload = { type: "PLAYER_STYLE", playerId, ...(override.name ? { name: override.name } : {}), tileColor: normalized };
  for (const targetSocket of allSockets()) queueOrSendSessionPayload(targetSocket, stylePayload);
  for (const targetSocket of socketsForPlayer(playerId)) {
    queueOrSendSessionPayload(targetSocket, { type: "PLAYER_UPDATE", tileColor: normalized, canToggleFog, suggestedColors, ...(seasonId ? { colorChangeUsed: true } : {}) });
  }
};
