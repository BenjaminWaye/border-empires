/**
 * Builds the per-tick iteration order for the AI command producer worker.
 *
 * The tick loop processes exactly one player per call (see
 * `// one player per tick` in ai-command-producer-worker.ts) and always
 * tries the returned order front-to-back, skipping players that fail
 * eligibility gates (pending command, rate limit, latched intent, budget).
 *
 * Without a fairness guard, `urgentByPlayerId` (populated whenever an AI
 * loses a defensive combat — see the COMBAT_RESOLVED handler) can starve
 * round-robin players indefinitely: if one or more players are placed under
 * near-continuous attack, they re-enter the urgent set on (almost) every
 * tick and always sort ahead of the round-robin players, so a player whose
 * round-robin turn comes up never actually gets serviced.
 *
 * This module fixes that by tracking, per player, the last time they were
 * actually considered (chosen as this tick's candidate) and force-promoting
 * any player who has gone longer than `starvationGuardMs` unconsidered to
 * the very front of the order — ahead of urgent players — guaranteeing an
 * upper bound on how long any AI player can go without a turn.
 */

export type BuildAiTickIterationOrderInput = {
  aiPlayerIds: readonly string[];
  urgentPlayerIds: ReadonlySet<string>;
  nextPlayerIndex: number;
  /** Last time (ms) each player was chosen as the tick's candidate, if ever. */
  lastConsideredAtByPlayer: ReadonlyMap<string, number>;
  nowMs: number;
  /** Max time (ms) a player may go without being considered, regardless of urgent traffic. */
  starvationGuardMs: number;
};

/** Default fairness bound: no AI player goes longer than this without a turn. */
export const DEFAULT_STARVATION_GUARD_MS = 2_000;

/**
 * Returns player indices (into aiPlayerIds) in the order the tick loop
 * should try them: starved players first (oldest-unconsidered first),
 * then currently-urgent players, then the normal round-robin sweep
 * starting at nextPlayerIndex. Each index appears at most once.
 */
export const buildAiTickIterationOrder = (input: BuildAiTickIterationOrderInput): number[] => {
  const { aiPlayerIds, urgentPlayerIds, nextPlayerIndex, lastConsideredAtByPlayer, nowMs, starvationGuardMs } = input;
  const iterationOrder: number[] = [];
  const seenIndices = new Set<number>();

  // 1. Starvation guard: anyone who hasn't been considered in
  //    starvationGuardMs jumps the queue ahead of urgent traffic, oldest
  //    first, so persistent urgent pressure elsewhere can't starve them.
  const starvedIndices = aiPlayerIds
    .map((id, idx) => ({ idx, lastConsidered: lastConsideredAtByPlayer.get(id) ?? 0 }))
    .filter(({ lastConsidered }) => nowMs - lastConsidered > starvationGuardMs)
    .sort((a, b) => a.lastConsidered - b.lastConsidered);
  for (const { idx } of starvedIndices) {
    if (!seenIndices.has(idx)) {
      iterationOrder.push(idx);
      seenIndices.add(idx);
    }
  }

  // 2. Urgent defenders next.
  for (const urgentId of urgentPlayerIds) {
    const idx = aiPlayerIds.indexOf(urgentId);
    if (idx >= 0 && !seenIndices.has(idx)) {
      iterationOrder.push(idx);
      seenIndices.add(idx);
    }
  }

  // 3. Normal round-robin sweep.
  for (let i = 0; i < aiPlayerIds.length; i++) {
    const idx = (nextPlayerIndex + i) % aiPlayerIds.length;
    if (!seenIndices.has(idx)) {
      iterationOrder.push(idx);
      seenIndices.add(idx);
    }
  }

  return iterationOrder;
};
