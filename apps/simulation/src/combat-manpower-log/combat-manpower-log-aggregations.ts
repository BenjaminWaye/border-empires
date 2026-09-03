// Pure aggregation functions over a CombatManpowerLoss[] (see
// combat-manpower-log.ts). No sim state read directly -- callers pass in
// already-collected data, mirroring territory-flip-log-aggregations.ts.
import type { BiggestBattle24h } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "./combat-manpower-log.js";

export type { BiggestBattle24h };

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
