import type { SeasonLobbyEntry } from "../season-lobby-roster/season-lobby-roster.js";

// Same cap the simulation enforces in season-join-capacity.ts
// (SIMULATION_MAX_SEASON_PLAYERS, default 120). The gateway doesn't share a
// module boundary with apps/simulation, so this is a deliberate small
// duplicate of that one-liner rather than a cross-app import -- both read
// the same env var by the same name.
export const resolveMaxSeasonPlayersForGateway = (): number =>
  Math.max(0, Number(process.env.SIMULATION_MAX_SEASON_PLAYERS ?? 120));

export type SeasonLobbyUpdatePayload = {
  type: "SEASON_LOBBY_UPDATE";
  waitingCount: number;
  maxPlayers: number;
  roster: SeasonLobbyEntry[];
};

// Builds the broadcast payload for everyone currently sitting in the
// pending-season lobby (see season-lobby-roster.ts). Roster size at this
// scale (~100-150 beta testers) is small enough to send in full every time
// -- no pagination/delta needed.
export const buildSeasonLobbyUpdatePayload = (
  roster: SeasonLobbyEntry[],
  maxPlayers: number = resolveMaxSeasonPlayersForGateway()
): SeasonLobbyUpdatePayload => ({
  type: "SEASON_LOBBY_UPDATE",
  waitingCount: roster.length,
  maxPlayers,
  roster
});
