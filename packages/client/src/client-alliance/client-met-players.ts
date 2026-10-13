import type { ClientState } from "../client-state/client-state.js";

export type MetPlayersState = Pick<ClientState, "tiles" | "tilesRevision" | "me" | "metPlayerIds" | "metPlayersScannedRevision">;

// Barbarians / Planetary Defense are environment, not diplomatic counterparts.
export const isMeetablePlayerId = (ownerId: string | undefined, me: string | undefined): ownerId is string =>
  Boolean(ownerId) && ownerId !== me && !ownerId!.startsWith("barbarian");

/**
 * "Met" = you have seen a tile owned by that player this season. The set only
 * ever grows within a season (a player you saw and later lost sight of, or
 * whose border tiles were captured, stays met) and is bounded by the player
 * count. It is rebuilt lazily from `state.tiles`, memoized on `tilesRevision`,
 * so the HUD (which re-renders on nearly every gateway message) only rescans
 * after tiles actually changed. Reset on season rollover / world regeneration.
 */
export const refreshMetPlayerIds = (state: MetPlayersState): ReadonlySet<string> => {
  if (state.metPlayersScannedRevision === state.tilesRevision) return state.metPlayerIds;
  for (const tile of state.tiles.values()) {
    if (isMeetablePlayerId(tile.ownerId, state.me)) state.metPlayerIds.add(tile.ownerId);
  }
  state.metPlayersScannedRevision = state.tilesRevision;
  return state.metPlayerIds;
};

export const resetMetPlayers = (state: Pick<ClientState, "metPlayerIds" | "metPlayersScannedRevision">): void => {
  state.metPlayerIds.clear();
  state.metPlayersScannedRevision = -1;
};
