/**
 * Rolling time-budget tracker for AI tick throttling.
 *
 * Caps cumulative AI work per-player to BUDGET_MS per WINDOW_MS sliding
 * window.  Previously a single global tracker shared the budget across
 * all AI players, allowing one large empire's planning time to starve
 * smaller AIs.  Each player now gets their own budget so slow/large AIs
 * cannot drown out the rest.
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

/**
 * Creates per-player budget trackers so one AI's planning time cannot
 * exhaust a shared pool and starve other AIs.
 */
export type PerPlayerAiBudgetTrackers = {
  /** Record work against a specific player. */
  recordWork(playerId: string, durationMs: number): void;
  /** Returns true when the given player has remaining budget. */
  available(playerId: string): boolean;
  /** Returns the total budget used by all players (for metrics). */
  totalUsedMs(): number;
};

export const createPerPlayerAiBudgetTrackers = (
  playerIds: readonly string[],
  windowMs = 1_000,
  budgetMs = 200
): PerPlayerAiBudgetTrackers => {
  const trackers = new Map<string, AiBudgetTracker>();
  for (const id of playerIds) {
    trackers.set(id, createAiBudgetTracker(windowMs, budgetMs));
  }

  return {
    recordWork(playerId: string, durationMs: number): void {
      const t = trackers.get(playerId);
      if (t) t.recordWork(durationMs);
    },
    available(playerId: string): boolean {
      const t = trackers.get(playerId);
      return t ? t.available() : false;
    },
    totalUsedMs(): number {
      let total = 0;
      for (const t of trackers.values()) total += t.usedMs();
      return total;
    }
  };
};
