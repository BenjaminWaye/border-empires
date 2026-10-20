import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

// Combat is logged when an attack is launched (its resolution is precomputed
// then), while the ownership flip is logged when it lands, so the two can be
// minutes apart. Anything later than this is not the same fight.
export const COMBAT_FLIP_MATCH_WINDOW_MS = 15 * 60_000;

export type CombatFlipMatches = {
  // Flips already told by a combat card, so they don't get a second
  // "−1 tile lost" territory row for the same capture.
  consumedFlips: ReadonlySet<TerritoryFlip>;
  // Failed attacks whose launch tile the defender took in return.
  originSeized: ReadonlySet<CombatManpowerLoss>;
};

const isCaptureFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean =>
  loss.attackerWon && flip.x === loss.x && flip.y === loss.y && flip.fromOwner === loss.defenderId && flip.toOwner === loss.attackerId;

const isSeizedOriginFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean => {
  if (loss.attackerWon || !loss.defenderId || flip.fromOwner !== loss.attackerId || flip.toOwner !== loss.defenderId) return false;
  // Entries logged before originX/originY existed fall back to "a tile
  // touching the target", which is where an attack is launched from.
  if (loss.originX !== undefined && loss.originY !== undefined) return flip.x === loss.originX && flip.y === loss.originY;
  return Math.abs(flip.x - loss.x) <= 1 && Math.abs(flip.y - loss.y) <= 1;
};

export const matchCombatToFlips = (combat: readonly CombatManpowerLoss[], flips: readonly TerritoryFlip[]): CombatFlipMatches => {
  const consumedFlips = new Set<TerritoryFlip>();
  const originSeized = new Set<CombatManpowerLoss>();
  const sortedFlips = [...flips].sort((a, b) => a.at - b.at);
  for (const loss of [...combat].sort((a, b) => a.at - b.at)) {
    const match = sortedFlips.find((flip) =>
      !consumedFlips.has(flip) &&
      flip.at >= loss.at &&
      flip.at - loss.at <= COMBAT_FLIP_MATCH_WINDOW_MS &&
      (isCaptureFlip(loss, flip) || isSeizedOriginFlip(loss, flip)));
    if (!match) continue;
    consumedFlips.add(match);
    if (!loss.attackerWon) originSeized.add(loss);
  }
  return { consumedFlips, originSeized };
};
