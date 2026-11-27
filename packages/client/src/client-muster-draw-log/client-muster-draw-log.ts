// How much each of the player's muster flags drew from the manpower pool in the
// last few minutes, for the Manpower panel. A pool fell from 634 to 78 in about
// 8 minutes, mostly into flags quietly refilling, and nothing showed it (owner
// request 2026-11-27).
//
// Built from what this client sees: each new server sample of a flag
// (`muster.updatedAt` moved on) that holds more than the last one counts the
// difference as drawn. A sample that holds less (an attack spent from it) counts
// nothing, so this can under-count but never over-count. It starts empty on
// every page load.
//
// Bounds (docs/agents/state-and-persistence-discipline.md): at most
// MAX_FLAGS flags, each with at most MAX_GAINS samples inside DRAW_WINDOW_MS;
// flags that stop appearing are dropped by `forgetMusterDrawsExcept`.

export const DRAW_WINDOW_MS = 10 * 60_000;
const MAX_FLAGS = 64;
const MAX_GAINS = 240;

type FlagDraws = { lastAmount: number; lastUpdatedAt: number; gains: Array<{ at: number; amount: number }> };

export type MusterDrawLog = Map<string, FlagDraws>;

export const createMusterDrawLog = (): MusterDrawLog => new Map();

const prune = (draws: FlagDraws, nowMs: number): void => {
  while (draws.gains.length > 0 && (nowMs - draws.gains[0]!.at > DRAW_WINDOW_MS || draws.gains.length > MAX_GAINS)) draws.gains.shift();
};

/** Records one observation of a flag's server-side amount. Repeats of the same sample change nothing. */
export const observeMusterSample = (
  log: MusterDrawLog,
  key: string,
  muster: { amount: number; updatedAt: number },
  nowMs: number
): void => {
  const draws = log.get(key);
  if (!draws) {
    log.set(key, { lastAmount: muster.amount, lastUpdatedAt: muster.updatedAt, gains: [] });
    while (log.size > MAX_FLAGS) {
      const oldest = log.keys().next();
      if (oldest.done) break;
      log.delete(oldest.value);
    }
    return;
  }
  if (muster.updatedAt === draws.lastUpdatedAt) return;
  const gain = muster.amount - draws.lastAmount;
  draws.lastAmount = muster.amount;
  draws.lastUpdatedAt = muster.updatedAt;
  if (gain > 0) draws.gains.push({ at: nowMs, amount: gain });
  prune(draws, nowMs);
};

/** Manpower this flag drew in the last DRAW_WINDOW_MS. */
export const musterDrawnRecently = (log: MusterDrawLog, key: string, nowMs: number): number => {
  const draws = log.get(key);
  if (!draws) return 0;
  prune(draws, nowMs);
  return draws.gains.reduce((sum, gain) => sum + gain.amount, 0);
};

/** Drops flags that are gone (cleared, captured). */
export const forgetMusterDrawsExcept = (log: MusterDrawLog, keep: ReadonlySet<string>): void => {
  for (const key of log.keys()) if (!keep.has(key)) log.delete(key);
};

/** The one log the HUD reads (the tracker scan and the Manpower panel both feed it). */
export const musterDrawLog: MusterDrawLog = createMusterDrawLog();
