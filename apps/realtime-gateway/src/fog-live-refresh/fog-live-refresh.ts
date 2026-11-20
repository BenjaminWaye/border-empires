// Fog-admin full-visibility refresh coordination.
//
// A fog-disabled (revealed map) session gets a full-world snapshot resubscribe
// whenever the world changes. Two problems this module owns:
//
// 1. Load. Each refresh asks the simulation to serialize the entire world
//    (~205k tiles, ~13 MB). Restarting the next one as soon as the previous
//    finished kept the simulation busy back-to-back, starving pings and
//    command submits until EXPAND/ATTACK failed with SIMULATION_UNAVAILABLE
//    (bug report 1c8538f4, staging 2026-11-20). The gap is now measured from
//    when the previous refresh *finished*, so the simulation gets real idle
//    time between rebuilds.
//
// 2. Stale results. A refresh is slow, so the admin can press "restore fog"
//    while one is in flight. When the stale full-visibility refresh resolved
//    it flipped every socket back to fogDisabled=true and resent the revealed
//    map, so restoring fog did nothing. Each explicit fog toggle now bumps a
//    per-player intent generation; a refresh started under an older
//    generation is discarded instead of applied.

export type FogIntentTracker = {
  /** Record a new explicit fog toggle; returns the generation it owns. */
  bump: (playerId: string) => number;
  current: (playerId: string) => number;
  isCurrent: (playerId: string, generation: number) => boolean;
  forget: (playerId: string) => void;
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
    isCurrent: (playerId, generation) => current(playerId) === generation,
    forget: (playerId) => {
      generationByPlayerId.delete(playerId);
    }
  };
};

export type FogLiveRefreshScheduler = {
  /** Mark the player's revealed view dirty; coalesces into one in-flight refresh. */
  schedule: (playerId: string, commandId: string) => void;
  /** Drop any pending (not yet started) refresh for the player. */
  cancelPending: (playerId: string) => void;
  /** Forget pacing state once the player has no fog-disabled socket left. */
  forget: (playerId: string) => void;
  inflight: (playerId: string) => Promise<void> | undefined;
};

export type FogLiveRefreshSchedulerDeps = {
  /** Minimum quiet time between the end of one refresh and the start of the next. */
  minGapMs: number;
  hasFogDisabledSocket: (playerId: string) => boolean;
  refresh: (playerId: string, commandId: string) => Promise<void>;
  onRefreshFailed: (playerId: string, commandId: string, error: unknown) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export const createFogLiveRefreshScheduler = (deps: FogLiveRefreshSchedulerDeps): FogLiveRefreshScheduler => {
  const inflightByPlayerId = new Map<string, Promise<void>>();
  const pendingByPlayerId = new Map<string, { commandId: string }>();
  const lastFinishedAtByPlayerId = new Map<string, number>();

  const run = async (playerId: string): Promise<void> => {
    try {
      while (pendingByPlayerId.has(playerId)) {
        const lastFinishedAt = lastFinishedAtByPlayerId.get(playerId);
        if (lastFinishedAt !== undefined) {
          const sinceLast = deps.now() - lastFinishedAt;
          if (sinceLast < deps.minGapMs) await deps.sleep(deps.minGapMs - sinceLast);
        }
        // Read the pending entry only after the wait so the refresh is
        // annotated with the newest trigger, and so a cancel during the wait
        // (fog restored) is honored.
        const pending = pendingByPlayerId.get(playerId);
        pendingByPlayerId.delete(playerId);
        if (!pending) continue;
        if (!deps.hasFogDisabledSocket(playerId)) continue;
        try {
          await deps.refresh(playerId, pending.commandId);
        } catch (error) {
          deps.onRefreshFailed(playerId, pending.commandId, error);
        } finally {
          lastFinishedAtByPlayerId.set(playerId, deps.now());
        }
      }
    } finally {
      inflightByPlayerId.delete(playerId);
    }
  };

  return {
    schedule: (playerId, commandId) => {
      pendingByPlayerId.set(playerId, { commandId });
      if (inflightByPlayerId.has(playerId)) return;
      inflightByPlayerId.set(playerId, run(playerId));
    },
    cancelPending: (playerId) => {
      pendingByPlayerId.delete(playerId);
    },
    forget: (playerId) => {
      pendingByPlayerId.delete(playerId);
      lastFinishedAtByPlayerId.delete(playerId);
    },
    inflight: (playerId) => inflightByPlayerId.get(playerId)
  };
};
