// Pure aggregation functions over a CombatManpowerLoss[] (see
// combat-manpower-log.ts). No sim state read directly -- callers pass in
// already-collected data, mirroring territory-flip-log-aggregations.ts.
import type { BiggestBattle24h, FiercestAttacker24h, ToughestTarget24h } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "./combat-manpower-log.js";

export type { BiggestBattle24h, FiercestAttacker24h, ToughestTarget24h };

/** Total manpower lost to combat across every player in the trailing 24h window. */
export const computeManpowerLostTotal24h = (log: readonly CombatManpowerLoss[]): number =>
  Math.round(log.reduce((sum, loss) => sum + loss.manpowerLoss, 0));

/**
 * The single costliest attack in the trailing 24h window, by manpower lost.
 * `excludeAttackerId` should be the barbarian system player id -- otherwise
 * a player's routine frontier grind against the permanent NPC faction can
 * surface as the day's "bloodiest battle" against a faction that isn't a
 * rival empire (see FiercestAttacker24h's doc comment for the same
 * rationale, which already excludes it).
 */
export const computeBiggestBattle24h = (
  log: readonly CombatManpowerLoss[],
  excludeBarbarianId?: string
): BiggestBattle24h => {
  const eligible = excludeBarbarianId
    ? log.filter((loss) => loss.attackerId !== excludeBarbarianId && loss.defenderId !== excludeBarbarianId)
    : log;
  if (eligible.length === 0) return null;
  const worst = eligible.reduce((acc, loss) => (loss.manpowerLoss > acc.manpowerLoss ? loss : acc), eligible[0]!);
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
 * `excludeBarbarianId` should be the barbarian system player id -- excludes
 * losses on either side of it so a player's routine frontier grind against
 * the permanent NPC faction doesn't surface as (or count toward) a
 * "toughest target" story, same rationale as computeBiggestBattle24h.
 */
export const computeToughestTarget24h = (
  log: readonly CombatManpowerLoss[],
  excludeBarbarianId?: string
): ToughestTarget24h => {
  const spentAgainstDefender = new Map<string, number>();
  for (const loss of log) {
    if (!loss.defenderId) continue;
    if (loss.defenderId === excludeBarbarianId || loss.attackerId === excludeBarbarianId) continue;
    spentAgainstDefender.set(loss.defenderId, (spentAgainstDefender.get(loss.defenderId) ?? 0) + loss.manpowerLoss);
  }
  let best: { defenderId: string; manpowerSpentAgainst: number } | undefined;
  for (const [defenderId, manpowerSpentAgainst] of spentAgainstDefender) {
    if (!best || manpowerSpentAgainst > best.manpowerSpentAgainst) best = { defenderId, manpowerSpentAgainst };
  }
  return best ? { defenderId: best.defenderId, manpowerSpentAgainst: Math.round(best.manpowerSpentAgainst) } : null;
};
