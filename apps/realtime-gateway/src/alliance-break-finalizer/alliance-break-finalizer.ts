import type { SocialState } from "../social-state/social-state-types.js";

export type AllianceBreakFinalizerDeps = {
  socialState: Pick<SocialState, "expiredAllianceBreaks" | "finalizeExpiredAllianceBreaks">;
  syncAllianceToSimulation: (input: { playerId: string; targetPlayerId: string; allied: boolean }) => Promise<boolean>;
  fanoutPlayerPayloads: (payloadsByPlayerId: Map<string, unknown[]>) => void;
};

// Pending alliance breaks become final once their notice period ends. Only
// pairs the simulation actually un-allied are finalized, so a failed sync is
// retried on the next run instead of leaving the gateway and simulation
// disagreeing. Runs are serialized: an overlapping tick is skipped.
export const createAllianceBreakFinalizer = (deps: AllianceBreakFinalizerDeps): (() => Promise<void>) => {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const expiredBreaks = deps.socialState.expiredAllianceBreaks();
      if (expiredBreaks.length === 0) return;
      const syncedPairs: Array<[string, string]> = [];
      for (const notice of expiredBreaks) {
        const [playerId, targetPlayerId] = notice.playerIds;
        if (await deps.syncAllianceToSimulation({ playerId, targetPlayerId, allied: false })) {
          syncedPairs.push([playerId, targetPlayerId]);
        }
      }
      if (syncedPairs.length === 0) return;
      const result = deps.socialState.finalizeExpiredAllianceBreaks(syncedPairs);
      if (result.expiredBreaks.length === 0) return;
      deps.fanoutPlayerPayloads(result.payloadsByPlayerId);
    } finally {
      running = false;
    }
  };
};
