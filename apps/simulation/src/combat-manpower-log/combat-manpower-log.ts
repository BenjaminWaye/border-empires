// Rolling in-memory log of combat manpower losses, captured from
// buildLockedCombatResolution (runtime-combat-support.ts) every time an
// ATTACK resolves with a nonzero manpower cost. Feeds the /api/activity
// aggregations (computeManpowerLostTotal24h, computeBiggestBattle24h) in
// ./combat-manpower-log-aggregations.ts. Deliberately mirrors
// territory-flip-log.ts's structure and bounding rationale exactly -- same
// kind of pure 24h activity feed, same reasons it's not snapshot state (see
// docs/agents/state-and-persistence-discipline.md): rebuilt empty on
// restart is fine since nothing downstream reads past the 24h window.
export const COMBAT_MANPOWER_WINDOW_MS = 24 * 60 * 60_000;
export const COMBAT_MANPOWER_LOG_MAX_ENTRIES = 50_000;

export type CombatManpowerLoss = {
  attackerId: string;
  defenderId: string | undefined;
  attackerWon: boolean;
  manpowerLoss: number;
  x: number;
  y: number;
  at: number;
};

export type CombatManpowerLogGauge = {
  entryCount: number;
  oldestAt: number | undefined;
  newestAt: number | undefined;
  capHits: number;
};

export type CombatManpowerLog = {
  record: (loss: CombatManpowerLoss) => void;
  prune: (now: number) => void;
  entries: () => readonly CombatManpowerLoss[];
  gauge: () => CombatManpowerLogGauge;
  /**
   * Reseeds the log from persisted entries on boot (see
   * activity-log-persistence.ts). Only meaningful on an empty log -- it
   * replaces rather than merges, so a stray second call cannot duplicate
   * history -- and drops anything already outside the 24h window.
   */
  restore: (entries: readonly CombatManpowerLoss[], now: number) => void;
};

export const createCombatManpowerLog = (options: { now?: () => number } = {}): CombatManpowerLog => {
  const now = options.now ?? (() => Date.now());
  let losses: CombatManpowerLoss[] = [];
  let capHits = 0;

  const prune = (at: number): void => {
    const cutoff = at - COMBAT_MANPOWER_WINDOW_MS;
    if (losses.length > 0 && losses[0]!.at >= cutoff) return;
    losses = losses.filter((loss) => loss.at >= cutoff);
  };

  const record = (loss: CombatManpowerLoss): void => {
    prune(now());
    losses.push(loss);
    if (losses.length > COMBAT_MANPOWER_LOG_MAX_ENTRIES) {
      capHits += 1;
      losses = losses.slice(losses.length - COMBAT_MANPOWER_LOG_MAX_ENTRIES);
    }
  };

  const restore = (entries: readonly CombatManpowerLoss[], at: number): void => {
    const cutoff = at - COMBAT_MANPOWER_WINDOW_MS;
    losses = entries
      .filter((loss) => loss.at >= cutoff)
      .sort((left, right) => left.at - right.at)
      .slice(-COMBAT_MANPOWER_LOG_MAX_ENTRIES);
  };

  return {
    record,
    prune,
    restore,
    entries: () => losses,
    gauge: (): CombatManpowerLogGauge => ({
      entryCount: losses.length,
      oldestAt: losses[0]?.at,
      newestAt: losses[losses.length - 1]?.at,
      capHits
    })
  };
};
