/**
 * Tracks submitted-command -> applied-command latency so we can explain
 * *why* a specific command was slow to apply (the sim-side half of "why did
 * the websocket reply take so long"). Bounded by maxEntries (FIFO eviction,
 * counted) rather than a TTL sweep — commandIds are unique, so any entry
 * that is never resolved (e.g. rejected before reaching the job queue) is a
 * true orphan and the size cap is what keeps memory bounded.
 */
export type CommandApplySlowDiagnostic = {
  commandId: string;
  submittedAt: number;
  queueWaitMs: number;
  applyDurationMs: number;
  totalSubmitToApplyMs: number;
};

export type CommandApplyTracker = {
  track: (commandId: string) => void;
  resolve: (commandId: string, applyDurationMs: number) => CommandApplySlowDiagnostic | undefined;
  evictedTotal: () => number;
};

export const createCommandApplyTracker = (options: {
  now?: () => number;
  maxEntries?: number;
  slowWarnMs: number;
}): CommandApplyTracker => {
  const now = options.now ?? (() => Date.now());
  const maxEntries = Math.max(1, options.maxEntries ?? 5_000);
  const submittedAtByCommandId = new Map<string, number>();
  let evictedTotal = 0;

  return {
    track(commandId: string): void {
      if (submittedAtByCommandId.size >= maxEntries) {
        const oldestKey = submittedAtByCommandId.keys().next().value;
        if (oldestKey !== undefined) {
          submittedAtByCommandId.delete(oldestKey);
          evictedTotal += 1;
        }
      }
      submittedAtByCommandId.set(commandId, now());
    },
    resolve(commandId: string, applyDurationMs: number): CommandApplySlowDiagnostic | undefined {
      const submittedAt = submittedAtByCommandId.get(commandId);
      if (submittedAt === undefined) return undefined;
      submittedAtByCommandId.delete(commandId);
      const totalSubmitToApplyMs = Math.max(0, now() - submittedAt);
      if (totalSubmitToApplyMs < options.slowWarnMs) return undefined;
      return {
        commandId,
        submittedAt,
        queueWaitMs: Math.max(0, totalSubmitToApplyMs - applyDurationMs),
        applyDurationMs,
        totalSubmitToApplyMs
      };
    },
    evictedTotal: () => evictedTotal
  };
};
