// Pure aggregation functions over a CombatManpowerLoss[] (see
// combat-manpower-log.ts). No sim state read directly -- callers pass in
// already-collected data, mirroring territory-flip-log-aggregations.ts.
import type { BiggestBattle24h, FiercestAttacker24h, ToughestTarget24h } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "./combat-manpower-log.js";

export type { BiggestBattle24h, FiercestAttacker24h, ToughestTarget24h };

/** Total manpower lost to combat across every player in the trailing 24h window. */
export const computeManpowerLostTotal24h = (log: readonly CombatManpowerLoss[]): number =>
  Math.round(log.reduce((sum, loss) => sum + loss.manpowerLoss, 0));

/** The single costliest attack in the trailing 24h window, by manpower lost. */
export const computeBiggestBattle24h = (log: readonly CombatManpowerLoss[]): BiggestBattle24h => {
  if (log.length === 0) return null;
  const worst = log.reduce((acc, loss) => (loss.manpowerLoss > acc.manpowerLoss ? loss : acc), log[0]!);
  return {
    attackerId: worst.attackerId,
    defenderId: worst.defenderId,
    attackerWon: worst.attackerWon,
    manpowerLoss: Math.round(worst.manpowerLoss),
    x: worst.x,
    y: worst.y,
    at: worst.at
  };
};

/**
 * The player who spent the most manpower attacking in the trailing 24h
 * window. `excludeAttackerId` should be the barbarian system player id --
 * see FiercestAttacker24h's doc comment for why barbarian attacks must be
 * excluded rather than merely deprioritized.
 */
export const computeFiercestAttacker24h = (
  log: readonly CombatManpowerLoss[],
  excludeAttackerId: string
): FiercestAttacker24h => {
  const spentByAttacker = new Map<string, number>();
  for (const loss of log) {
    if (loss.attackerId === excludeAttackerId) continue;
    spentByAttacker.set(loss.attackerId, (spentByAttacker.get(loss.attackerId) ?? 0) + loss.manpowerLoss);
  }
  let best: { attackerId: string; manpowerSpent: number } | undefined;
  for (const [attackerId, manpowerSpent] of spentByAttacker) {
    if (!best || manpowerSpent > best.manpowerSpent) best = { attackerId, manpowerSpent };
  }
  return best ? { attackerId: best.attackerId, manpowerSpent: Math.round(best.manpowerSpent) } : null;
};

/**
 * The player attackers spent the most manpower attempting to dislodge in the
 * trailing 24h window, win or lose (see ToughestTarget24h's doc comment).
 * Attacks on unclaimed land (defenderId undefined) don't count toward anyone.
 */
export const computeToughestTarget24h = (log: readonly CombatManpowerLoss[]): ToughestTarget24h => {
  const spentAgainstDefender = new Map<string, number>();
  for (const loss of log) {
    if (!loss.defenderId) continue;
    spentAgainstDefender.set(loss.defenderId, (spentAgainstDefender.get(loss.defenderId) ?? 0) + loss.manpowerLoss);
  }
  let best: { defenderId: string; manpowerSpentAgainst: number } | undefined;
  for (const [defenderId, manpowerSpentAgainst] of spentAgainstDefender) {
    if (!best || manpowerSpentAgainst > best.manpowerSpentAgainst) best = { defenderId, manpowerSpentAgainst };
  }
  return best ? { defenderId: best.defenderId, manpowerSpentAgainst: Math.round(best.manpowerSpentAgainst) } : null;
};
