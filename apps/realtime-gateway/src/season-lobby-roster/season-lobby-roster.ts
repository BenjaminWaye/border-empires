// Tracks who is currently "checked into" the pending-season lobby -- i.e.
// has hit JOIN_SEASON while the season hasn't reached scheduledStartAt yet
// (see handle-join-season-message.ts). Distinct from joinedPlayerIds
// (players already spawned into the world): this is purely a waiting-room
// roster for the SEASON_LOBBY_UPDATE broadcast.
//
// In-memory and reset via reset() whenever a season actually starts, mirroring
// the existing SeasonStartVoteTracker pattern for other pre-season ephemeral
// state in this file's sibling gateway-app.ts. Player identity/flag remain
// durable via the profile store regardless -- a gateway restart only loses
// "who's currently waiting", which clients re-establish within seconds by
// retrying JOIN_SEASON.
export type SeasonLobbyEntry = {
  playerId: string;
  name: string;
  countryFlag?: string;
};

export type SeasonLobbyRoster = {
  // Adds/updates the entry for playerId. Returns true if the roster actually
  // changed (new arrival, or name/flag changed) so callers can skip a
  // redundant broadcast.
  checkIn: (playerId: string, name: string, countryFlag?: string) => boolean;
  remove: (playerId: string) => void;
  has: (playerId: string) => boolean;
  reset: () => void;
  size: () => number;
  entries: () => SeasonLobbyEntry[];
};

export const createSeasonLobbyRoster = (): SeasonLobbyRoster => {
  const byPlayerId = new Map<string, SeasonLobbyEntry>();

  return {
    checkIn(playerId, name, countryFlag) {
      const existing = byPlayerId.get(playerId);
      const entry: SeasonLobbyEntry = { playerId, name, ...(countryFlag ? { countryFlag } : {}) };
      const changed = !existing || existing.name !== entry.name || existing.countryFlag !== entry.countryFlag;
      byPlayerId.set(playerId, entry);
      return changed;
    },
    remove(playerId) {
      byPlayerId.delete(playerId);
    },
    has(playerId) {
      return byPlayerId.has(playerId);
    },
    reset() {
      byPlayerId.clear();
    },
    size() {
      return byPlayerId.size;
    },
    entries() {
      return [...byPlayerId.values()];
    }
  };
};
