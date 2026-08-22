import { createSeasonLobbyRoster, type SeasonLobbyRoster } from "./season-lobby-roster.js";
import { buildSeasonLobbyUpdatePayload } from "../season-lobby-broadcast/season-lobby-broadcast.js";
import { handleSetCountryFlagMessage } from "../gateway-app/handle-set-country-flag-message.js";
import { resolveLobbyDisplay, type LobbyDisplayLookup } from "./lobby-display-lookup.js";

type ProfileOverridesLike = {
  get: (playerId: string) => { name?: string; countryFlag?: string } | undefined;
  setCountryFlag: (playerId: string, countryFlag: string) => void;
};
type ProfileStoreLike = {
  get: (playerId: string) => Promise<{ name?: string; countryFlag?: string } | undefined>;
  setCountryFlag: (playerId: string, countryFlag: string) => Promise<unknown>;
};

export type SeasonLobbyGatewayIntegrationDeps = {
  preSerializeBroadcast: (payload: unknown) => unknown;
  allSockets: () => Iterable<import("ws").WebSocket>;
  queueOrSendSessionPayload: (socket: import("ws").WebSocket, payload: unknown) => void;
  profileOverrides: ProfileOverridesLike;
  profileStore: ProfileStoreLike;
  invalidateProfileCache: (playerId: string) => void;
  fallbackName: (playerId: string) => string;
};

// Bundles everything gateway-app.ts needs to wire up the season lobby: the
// roster itself, the JOIN_SEASON check-in callback, the SEASON_LOBBY_UPDATE
// broadcaster (modeled on the SEASON_START_VOTE_UPDATE pattern), and the
// SET_COUNTRY_FLAG handler. Kept as a single factory so gateway-app.ts (at
// its 500-line cap) only needs one call site instead of wiring each piece.
export const createSeasonLobbyGatewayIntegration = (deps: SeasonLobbyGatewayIntegrationDeps) => {
  const roster: SeasonLobbyRoster = createSeasonLobbyRoster();
  const lookup: LobbyDisplayLookup = {
    getOverride: deps.profileOverrides.get,
    getStoredProfile: deps.profileStore.get,
    fallbackName: deps.fallbackName
  };

  const broadcastLobbyUpdate = (): void => {
    const payload = deps.preSerializeBroadcast(buildSeasonLobbyUpdatePayload(roster.entries()));
    for (const socket of deps.allSockets()) deps.queueOrSendSessionPayload(socket, payload);
  };

  const checkIntoLobby = async (playerId: string): Promise<{ name: string; countryFlag?: string }> => {
    const display = await resolveLobbyDisplay(playerId, lookup);
    roster.checkIn(playerId, display.name, display.countryFlag);
    return display;
  };

  const setCountryFlag = (playerId: string, countryFlag: unknown, sendJson: (payload: unknown) => void): Promise<void> =>
    handleSetCountryFlagMessage({
      playerId,
      countryFlag,
      profileStore: deps.profileStore,
      profileOverrides: { ...lookup, setCountryFlag: deps.profileOverrides.setCountryFlag },
      invalidateProfileCache: deps.invalidateProfileCache,
      sendJson,
      lobbyRoster: roster,
      broadcastLobbyUpdate
    });

  return { roster, checkIntoLobby, broadcastLobbyUpdate, setCountryFlag };
};
