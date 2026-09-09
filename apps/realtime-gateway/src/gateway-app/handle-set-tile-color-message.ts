import { isTaken, normalizeHex, suggestAlternative } from "../player-color-allocation/player-color-allocation.js";
import { pickSuggestedPalette } from "../player-color-allocation/player-color-allocation.js";

// Extracted from gateway-app.ts's dispatcher switch to keep that (already
// oversized) file from growing -- mirrors handle-set-country-flag-message.ts.
// Validates + persists a SET_TILE_COLOR request, then broadcasts the new
// color to every connected player and updates the sender's own HUD state.
export type SetTileColorMessageDeps = {
  playerId: string;
  color: unknown;
  canToggleFog: boolean;
  buildTakenColorSet: (excludePlayerId: string) => Promise<Set<string>>;
  incrementColorCollisionRejectedTotal: () => void;
  profileStore: { setTileColor: (playerId: string, tileColor: string) => Promise<{ name?: string; tileColor?: string; profileComplete?: boolean }> };
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
    profileStore, invalidateProfileCache, profileOverrides, sendJson, allSockets, socketsForPlayer, queueOrSendSessionPayload
  } = deps;
  const normalized = normalizeHex(typeof color === "string" ? color : "");
  if (!normalized) {
    sendJson({ type: "ERROR", code: "COLOR_INVALID", message: "Color must be a valid hex code (#rrggbb)." });
    return;
  }
  const taken = await buildTakenColorSet(playerId);
  if (isTaken(normalized, taken)) {
    const suggestion = suggestAlternative(normalized, taken);
    incrementColorCollisionRejectedTotal();
    sendJson({ type: "ERROR", code: "COLOR_TAKEN", message: "That colour is already taken by another empire.", suggestion });
    return;
  }
  const storedProfile = await profileStore.setTileColor(playerId, normalized);
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
    queueOrSendSessionPayload(targetSocket, { type: "PLAYER_UPDATE", tileColor: normalized, canToggleFog, suggestedColors });
  }
};
