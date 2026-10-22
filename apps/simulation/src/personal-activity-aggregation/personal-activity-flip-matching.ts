import { COMBAT_LOCK_MS } from "@border-empires/shared";

import type { PersonalActivityTileFeature } from "@border-empires/game-domain";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

// Combat is logged when an attack is launched (its roll is precomputed then),
// while the ownership flip is logged when the attack lands, COMBAT_LOCK_MS
// later at most (minus any attack-speed reduction). The window allows for
// slack such as a lock recovered across a restart, while staying far shorter
// than the time it takes the same tile to change hands again in a later fight.
export const COMBAT_FLIP_MATCH_WINDOW_MS = 10 * COMBAT_LOCK_MS;

export type CombatFlipMatches = {
  // The combat entries with their outcome confirmed against the flips: a
  // launch-time win that never captured the tile (reversed on landing by a
  // fort ward or an Aegis Lock, or a lock dropped as stale) becomes a failed
  // attack with no plunder. Use these instead of the raw entries.
  combat: CombatManpowerLoss[];
  // Flips already told by a combat card, so they don't get a second
  // "−1 tile lost" territory row for the same capture.
  consumedFlips: ReadonlySet<TerritoryFlip>;
  // Failed attacks (entries of `combat`) whose launch tile the defender took.
  originSeized: ReadonlySet<CombatManpowerLoss>;
  // What stood on the target of each capture (entries of `combat`), read off
  // its matched flip, so a combat card can say "your Palisade fell".
  capturedFeatures: ReadonlyMap<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>;
};

const isCaptureFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean =>
  flip.x === loss.x && flip.y === loss.y && flip.fromOwner === loss.defenderId && flip.toOwner === loss.attackerId;

const isSeizedOriginFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean => {
  if (!loss.defenderId || flip.fromOwner !== loss.attackerId || flip.toOwner !== loss.defenderId) return false;
  // Entries logged before originX/originY existed fall back to "a tile
  // touching the target", which is where an attack is launched from.
  if (loss.originX !== undefined && loss.originY !== undefined) return flip.x === loss.originX && flip.y === loss.originY;
  return Math.abs(flip.x - loss.x) <= 1 && Math.abs(flip.y - loss.y) <= 1;
};

export const matchCombatToFlips = (combat: readonly CombatManpowerLoss[], flips: readonly TerritoryFlip[], now: number): CombatFlipMatches => {
  const consumedFlips = new Set<TerritoryFlip>();
  const sortedFlips = [...flips].sort((a, b) => a.at - b.at);
  const sortedCombat = [...combat].sort((a, b) => a.at - b.at);
  const claim = (loss: CombatManpowerLoss, matches: (loss: CombatManpowerLoss, flip: TerritoryFlip) => boolean): TerritoryFlip | undefined => {
    const match = sortedFlips.find((flip) =>
      !consumedFlips.has(flip) && flip.at >= loss.at && flip.at - loss.at <= COMBAT_FLIP_MATCH_WINDOW_MS && matches(loss, flip));
    if (match) consumedFlips.add(match);
    return match;
  };
  const capturedFeatures = new Map<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>();
  // Captures first, for every entry, so a later fight's capture of a launch
  // tile is never mistaken for an earlier failed attack's seized origin.
  const confirmed = sortedCombat.map((loss) => {
    if (!loss.attackerWon) return loss;
    const capture = claim(loss, isCaptureFlip);
    if (capture) {
      if (capture.features?.length) capturedFeatures.set(loss, capture.features);
      return loss;
    }
    // Still in flight: its flip may simply not have landed yet.
    if (now - loss.at < COMBAT_FLIP_MATCH_WINDOW_MS) return loss;
    return { ...loss, attackerWon: false, pillagedGold: 0, defenderGoldLoss: 0 };
  });
  const originSeized = new Set<CombatManpowerLoss>();
  for (const loss of confirmed) {
    if (!loss.attackerWon && claim(loss, isSeizedOriginFlip)) originSeized.add(loss);
  }
  return { combat: confirmed, consumedFlips, originSeized, capturedFeatures };
};
