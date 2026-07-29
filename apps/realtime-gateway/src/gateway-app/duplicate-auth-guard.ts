// Guards against a duplicate AUTH on one socket running a second, concurrent
// login pipeline (duplicate bootstrap_subscribe + live_subscribe RPCs racing
// each other, doubling snapshot-build work and potentially leaving the
// socket's subscription state torn between the two attempts).

type AuthGuardSession = { authInProgress: boolean };

/** Returns true if this AUTH should proceed (and marks the session as
 * in-progress); false if a login is already running on this socket. */
export const claimAuthSlot = (
  session: AuthGuardSession,
  channel: string,
  recordEvent: (level: "warn", event: string, payload: Record<string, unknown>) => void
): boolean => {
  if (session.authInProgress) {
    recordEvent("warn", "gateway_auth_duplicate_ignored", { channel });
    return false;
  }
  session.authInProgress = true;
  return true;
};

/** Must be called in the message handler's finally so a rejected/thrown
 * AUTH doesn't leave the socket permanently unable to retry. */
export const releaseAuthSlot = (session: AuthGuardSession, messageType: string | undefined): void => {
  if (messageType === "AUTH") session.authInProgress = false;
};

// Tracks players with a seeded bootstrap snapshot so the live subscribe RPC
// can skip re-marshalling tiles it already has. evictSeededPlayerId must be
// called wherever playerSubscriptions itself evicts that player's cache —
// previously this was add-only and never cleared, so a reconnect after the
// first login always requested omitTiles: true even once the cache was gone.
export type SeededPlayerTracker = {
  seededPlayerIds: Set<string>;
  evictSeededPlayerId: (playerId: string) => void;
};

export const createSeededPlayerTracker = (socketsForPlayer: (playerId: string) => ReadonlySet<unknown>): SeededPlayerTracker => {
  const seededPlayerIds = new Set<string>();
  return {
    seededPlayerIds,
    evictSeededPlayerId: (playerId) => {
      if (socketsForPlayer(playerId).size === 0) seededPlayerIds.delete(playerId);
    }
  };
};
