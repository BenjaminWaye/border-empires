import type { SeasonLobbyRoster } from "../season-lobby-roster/season-lobby-roster.js";
import { resolveLobbyDisplay, type LobbyDisplayLookup } from "../season-lobby-roster/lobby-display-lookup.js";

// Extracted from gateway-app.ts's dispatcher switch to keep that (already
// oversized) file from growing -- mirrors handle-join-season-message.ts.
// Validates + persists an opt-in 2-letter ISO country flag, and re-broadcasts
// the season lobby roster if the player is currently checked into it.
export type SetCountryFlagMessageDeps = {
  playerId: string;
  countryFlag: unknown;
  profileStore: { setCountryFlag: (playerId: string, countryFlag: string) => Promise<unknown> };
  profileOverrides: LobbyDisplayLookup & { setCountryFlag: (playerId: string, countryFlag: string) => void };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
  lobbyRoster: SeasonLobbyRoster;
  broadcastLobbyUpdate: () => void;
};

export const handleSetCountryFlagMessage = async (deps: SetCountryFlagMessageDeps): Promise<void> => {
  const { playerId, profileStore, profileOverrides, invalidateProfileCache, sendJson, lobbyRoster, broadcastLobbyUpdate } = deps;
  const raw = typeof deps.countryFlag === "string" ? deps.countryFlag.toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(raw)) {
    sendJson({ type: "ERROR", code: "COUNTRY_FLAG_INVALID", message: "Country flag must be a 2-letter code." });
    return;
  }
  await profileStore.setCountryFlag(playerId, raw);
  invalidateProfileCache(playerId);
  profileOverrides.setCountryFlag(playerId, raw);
  sendJson({ type: "COUNTRY_FLAG_SET", countryFlag: raw });
  if (lobbyRoster.has(playerId)) {
    const display = await resolveLobbyDisplay(playerId, profileOverrides);
    lobbyRoster.checkIn(playerId, display.name, raw);
    broadcastLobbyUpdate();
  }
};
