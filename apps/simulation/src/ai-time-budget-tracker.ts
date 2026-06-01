/**
 * Rolling time-budget tracker for AI tick throttling.
 *
 * Caps cumulative AI work to BUDGET_MS per WINDOW_MS sliding window.
 * Used by simulation-service to prevent AI planner phases from
 * saturating the sim main thread and starving auth gRPCs.
 */
export type AiBudgetTracker = {
  /** Record wall-clock milliseconds consumed by a completed AI tick. */
  recordWork(durationMs: number): void;
  /** Returns true when the current window has remaining budget. */
  available(): boolean;
  /** Returns the cumulative work (ms) in the current window. */
  usedMs(): number;
};

export const createAiBudgetTracker = (
  windowMs = 1_000,
  budgetMs = 200
): AiBudgetTracker => {
  const entries: { time: number; durationMs: number }[] = [];

  const purge = (now: number) => {
    while (entries.length > 0) {
      const head = entries[0];
      if (!head || head.time >= now - windowMs) break;
      entries.shift();
    }
  };

  return {
    recordWork(durationMs: number): void {
      const now = Date.now();
      entries.push({ time: now, durationMs });
      purge(now);
    },
    available(): boolean {
      const now = Date.now();
      purge(now);
      return entries.reduce((sum, e) => sum + e.durationMs, 0) < budgetMs;
    },
    usedMs(): number {
      const now = Date.now();
      purge(now);
      return entries.reduce((sum, e) => sum + e.durationMs, 0);
    }
  };
};
