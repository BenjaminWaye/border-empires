// Pure combat for the Duke layer (§21.7): a Defending Fighter absorbs an
// attack in one simultaneous exchange (damage = W*20 - A*10); once an attacker
// is through -- no defender, or the defender is destroyed -- a hit costs a flat,
// capped 20 Stability regardless of attacker size.
import {
  FIGHTER_ARMOR,
  FIGHTER_WEAPONS,
  STABILITY_HIT_CAP,
  WARDEN_ARMOR,
  WARDEN_HULL,
  WARDEN_WEAPONS,
  exchangeDamage
} from "./galaxy-duke-config.js";
import type { DukeFighter } from "./galaxy-duke-types.js";

// Index of the healthiest Fighter that is still alive, or -1.
export const healthiestFighterIndex = (fighters: ReadonlyArray<DukeFighter>): number =>
  fighters.reduce((best, f, i) => (f.hull > 0 && (best === -1 || f.hull > fighters[best]!.hull) ? i : best), -1);

const withHull = (fighters: ReadonlyArray<DukeFighter>, index: number, hull: number): DukeFighter[] =>
  fighters.flatMap((f, i) => (i !== index ? [f] : hull > 0 ? [{ hull }] : []));

export type WardenIncursionOutcome = {
  fighters: DukeFighter[];
  repelled: boolean;
  stabilityLoss: number;
  hullLoss: number;
  fighterLost: boolean;
};

export const resolveWardenIncursion = (fighters: ReadonlyArray<DukeFighter>): WardenIncursionOutcome => {
  const idx = healthiestFighterIndex(fighters);
  if (idx === -1) return { fighters: [...fighters], repelled: false, stabilityLoss: STABILITY_HIT_CAP, hullLoss: 0, fighterLost: false };
  const damageToRelic = exchangeDamage(FIGHTER_WEAPONS, WARDEN_ARMOR);
  const hullLoss = exchangeDamage(WARDEN_WEAPONS, FIGHTER_ARMOR);
  const remaining = fighters[idx]!.hull - hullLoss;
  // Both sides fire at once, so a Fighter that dies still kills the relic.
  const repelled = damageToRelic >= WARDEN_HULL;
  return {
    fighters: withHull(fighters, idx, remaining),
    repelled,
    stabilityLoss: repelled ? 0 : STABILITY_HIT_CAP,
    hullLoss,
    fighterLost: remaining <= 0
  };
};

export type FighterRaidOutcome = {
  attackerHullAfter: number;
  defenderFighters: DukeFighter[];
  through: boolean;
  stabilityLoss: number;
  defenderLost: boolean;
  attackerLost: boolean;
  exchanged: boolean;
};

export const resolveFighterRaid = (attackerHull: number, defenderFighters: ReadonlyArray<DukeFighter>): FighterRaidOutcome => {
  const idx = healthiestFighterIndex(defenderFighters);
  if (idx === -1) {
    return { attackerHullAfter: attackerHull, defenderFighters: [...defenderFighters], through: true, stabilityLoss: STABILITY_HIT_CAP, defenderLost: false, attackerLost: false, exchanged: false };
  }
  const damage = exchangeDamage(FIGHTER_WEAPONS, FIGHTER_ARMOR);
  const defenderAfter = defenderFighters[idx]!.hull - damage;
  const attackerAfter = attackerHull - damage;
  const through = defenderAfter <= 0;
  return {
    attackerHullAfter: Math.max(0, attackerAfter),
    defenderFighters: withHull(defenderFighters, idx, defenderAfter),
    through,
    stabilityLoss: through ? STABILITY_HIT_CAP : 0,
    defenderLost: through,
    attackerLost: attackerAfter <= 0,
    exchanged: true
  };
};

// "This system can take N more hits like this before it is contested" (§21.7).
export const hitsRemaining = (stability: number, hit = STABILITY_HIT_CAP): number => Math.max(0, Math.floor(stability / hit));
