// Fog-admin (revealed map) toggle coordination.
//
// A revealed session is kept current by unfiltered live tile deltas from the
// simulation ("spectating", see apps/simulation/src/tile-delta-fanout-filter.ts).
// It used to be kept current by re-requesting the entire world (~205k tiles,
// ~38 MB) whenever the admin's own view changed, which stalled the simulation
// and the gateway for everyone (docs/load-results/full-reveal-2026-11-23.md);
// that scheduler is gone and must not come back.
//
// What is left here guards the explicit toggle. A full-visibility snapshot is
// slow, so the admin can press "restore fog" while one is in flight. When the
// stale reveal resolved it flipped every socket back to fogDisabled=true and
// resent the revealed map, so restoring fog did nothing. Each explicit toggle
// bumps a per-player intent generation; a snapshot requested under an older
// generation is discarded instead of applied.

export type FogIntentTracker = {
  /** Record a new explicit fog toggle; returns the generation it owns. */
  bump: (playerId: string) => number;
  current: (playerId: string) => number;
  isCurrent: (playerId: string, generation: number) => boolean;
};

export const createFogIntentTracker = (): FogIntentTracker => {
  const generationByPlayerId = new Map<string, number>();
  const current = (playerId: string): number => generationByPlayerId.get(playerId) ?? 0;
  return {
    bump: (playerId) => {
      const next = current(playerId) + 1;
      generationByPlayerId.set(playerId, next);
      return next;
    },
    current,
    // Entries are never deleted (one small number per fog admin): resetting a
    // counter to 0 could make a refresh captured before the reset look current.
    isCurrent: (playerId, generation) => current(playerId) === generation
  };
};

/**
 * Marks every socket of the player fog-restored and returns an undo that puts back each
 * socket's previous fogDisabled value — for when the restore snapshot then fails, so the
 * server keeps agreeing with clients that never received FOG_UPDATE false.
 */
export const clearFogDisabledForRestore = <Socket, Session extends { fogDisabled: boolean }>(
  sockets: Iterable<Socket>,
  sessionFor: (socket: Socket) => Session | undefined
): (() => void) => {
  const previous = new Map<Socket, boolean>();
  for (const socket of sockets) {
    const session = sessionFor(socket);
    if (!session) continue;
    previous.set(socket, session.fogDisabled);
    session.fogDisabled = false;
  }
  return () => {
    for (const [socket, fogDisabled] of previous) {
      const session = sessionFor(socket);
      if (session) session.fogDisabled = fogDisabled;
    }
  };
};
