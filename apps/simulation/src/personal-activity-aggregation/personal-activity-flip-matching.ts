import { COMBAT_LOCK_MS } from "@border-empires/shared";

import type { PersonalActivityTileFeature } from "@border-empires/game-domain";

import type { CombatTileFeatures } from "./personal-activity-features.js";
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
  // What stood on each captured target and each seized launch tile (keyed by
  // entries of `combat`), read off the matched flip, so a combat card can say
  // "your Palisade fell" -- those flips no longer get a territory card.
  tileFeatures: CombatTileFeatures;
};

// A capture known from somewhere other than the flip log -- a TOWN_LOST or
// DOCK_LOST impact, which lives in its own (much quieter) log. It
// lets a win whose flip is missing (e.g. a restart before PR #2463 persisted
// only the newest flips) stay a win instead of being read as repelled.
export type KnownCapture = { x: number; y: number; at: number; defenderId: string; attackerId?: string };

const isKnownCapture = (loss: CombatManpowerLoss, capture: KnownCapture): boolean =>
  capture.x === loss.x && capture.y === loss.y && capture.defenderId === loss.defenderId &&
  (capture.attackerId === undefined || capture.attackerId === loss.attackerId) &&
  capture.at >= loss.at && capture.at - loss.at <= COMBAT_FLIP_MATCH_WINDOW_MS;

const isCaptureFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean =>
  flip.x === loss.x && flip.y === loss.y && flip.fromOwner === loss.defenderId && flip.toOwner === loss.attackerId;

const isSeizedOriginFlip = (loss: CombatManpowerLoss, flip: TerritoryFlip): boolean => {
  if (!loss.defenderId || flip.fromOwner !== loss.attackerId || flip.toOwner !== loss.defenderId) return false;
  // Entries logged before originX/originY existed fall back to "a tile
  // touching the target", which is where an attack is launched from.
  if (loss.originX !== undefined && loss.originY !== undefined) return flip.x === loss.originX && flip.y === loss.originY;
  return Math.abs(flip.x - loss.x) <= 1 && Math.abs(flip.y - loss.y) <= 1;
};

export const matchCombatToFlips = (
  combat: readonly CombatManpowerLoss[],
  flips: readonly TerritoryFlip[],
  now: number,
  knownCaptures: readonly KnownCapture[] = []
): CombatFlipMatches => {
  const consumedFlips = new Set<TerritoryFlip>();
  const usedKnownCaptures = new Set<KnownCapture>();
  const sortedFlips = [...flips].sort((a, b) => a.at - b.at);
  const sortedCombat = [...combat].sort((a, b) => a.at - b.at);
  const claim = (loss: CombatManpowerLoss, matches: (loss: CombatManpowerLoss, flip: TerritoryFlip) => boolean): TerritoryFlip | undefined => {
    const match = sortedFlips.find((flip) =>
      !consumedFlips.has(flip) && flip.at >= loss.at && flip.at - loss.at <= COMBAT_FLIP_MATCH_WINDOW_MS && matches(loss, flip));
    if (match) consumedFlips.add(match);
    return match;
  };
  const captured = new Map<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>();
  const seizedOrigin = new Map<CombatManpowerLoss, readonly PersonalActivityTileFeature[]>();
  // Captures first, for every entry, so a later fight's capture of a launch
  // tile is never mistaken for an earlier failed attack's seized origin.
  const confirmed = sortedCombat.map((loss) => {
    if (!loss.attackerWon) return loss;
    const capture = claim(loss, isCaptureFlip);
    if (capture) {
      if (capture.features?.length) captured.set(loss, capture.features);
      return loss;
    }
    // Still in flight: its flip may simply not have landed yet.
    if (now - loss.at < COMBAT_FLIP_MATCH_WINDOW_MS) return loss;
    const known = knownCaptures.find((entry) => !usedKnownCaptures.has(entry) && isKnownCapture(loss, entry));
    if (known) {
      usedKnownCaptures.add(known);
      return loss;
    }
    return { ...loss, attackerWon: false, pillagedGold: 0, defenderGoldLoss: 0 };
  });
  const originSeized = new Set<CombatManpowerLoss>();
  for (const loss of confirmed) {
    if (loss.attackerWon) continue;
    const seized = claim(loss, isSeizedOriginFlip);
    if (!seized) continue;
    originSeized.add(loss);
    if (seized.features?.length) seizedOrigin.set(loss, seized.features);
  }
  return { combat: confirmed, consumedFlips, originSeized, tileFeatures: { captured, seizedOrigin } };
};
