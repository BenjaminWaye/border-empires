import { combatWinChance } from "../math/math.js";
import { BREAKTHROUGH_DEBUFF_MULT } from "../config.js";

export type FrontierCombatPreviewTile = {
  terrain?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
  // True iff the target tile has an active (not under-construction) fort owned by the defender.
  hasFort?: boolean | undefined;
  // Breakthrough momentum: set when tile is freshly breached; debuffs defence.
  breachShockUntil?: number | undefined;
};

export type FrontierCombatPreview = {
  atkEff: number;
  defEff: number;
  defMult: number;
  atkMult: number;
  winChance: number;
};

// Attacker-side multipliers come from the attacker's tech/domain effects;
// defender-side multipliers come from the defender's. The caller is expected
// to resolve both and pass them in here together.
export type FrontierCombatModifiers = {
  attackerOutpostMult?: number;
  attackVsSettledMult?: number;
  attackVsFortsMult?: number;
  attackVsBarbariansMult?: number;
  defenderOwnerId?: string | undefined;
  fortDefenseMult?: number;
  // Muster system garrison scaling: when set, fort defense is proportional to fill ratio.
  musterSystemEnabled?: boolean;
  fortGarrison?: number | undefined;
  fortGarrisonCap?: number | undefined;
  // Breakthrough momentum: current timestamp for breach-window check.
  nowMs?: number | undefined;
};

export const FRONTIER_COMBAT_MODULE = Symbol("frontier-combat");

const defenseMultiplierForTile = (
  target: FrontierCombatPreviewTile,
  modifiers: FrontierCombatModifiers
): number => {
  // Legacy parity: frontier tiles provide no defensive effective power.
  if (target.ownershipState === "FRONTIER") return 0;
  let defMult = 1;
  if (target.ownershipState === "SETTLED") defMult *= 1.35;
  if (target.townType) defMult *= 1.2;
  if (target.dockId) defMult *= 1.1;
  if (target.hasFort) {
    const baseMult = modifiers.fortDefenseMult ?? 1;
    if (modifiers.musterSystemEnabled && modifiers.fortGarrisonCap != null && modifiers.fortGarrisonCap > 0) {
      const fillRatio = Math.min(1, (modifiers.fortGarrison ?? 0) / modifiers.fortGarrisonCap);
      defMult *= 1 + (baseMult - 1) * fillRatio;
    } else {
      defMult *= baseMult;
    }
  }
  if (target.breachShockUntil != null && modifiers.nowMs != null && target.breachShockUntil > modifiers.nowMs) {
    defMult *= BREAKTHROUGH_DEBUFF_MULT;
  }
  return defMult;
};

const buildFrontierCombatPreviewImpl = (
  target: FrontierCombatPreviewTile,
  modifiers: FrontierCombatModifiers = {}
): FrontierCombatPreview => {
  let atkMult = modifiers.attackerOutpostMult ?? 1;
  if (target.ownershipState === "SETTLED") atkMult *= modifiers.attackVsSettledMult ?? 1;
  if (target.hasFort) atkMult *= modifiers.attackVsFortsMult ?? 1;
  if (modifiers.defenderOwnerId?.startsWith("barbarian")) atkMult *= modifiers.attackVsBarbariansMult ?? 1;
  const atkEff = 10 * atkMult;
  const defMult = defenseMultiplierForTile(target, modifiers);
  const defEff = 10 * defMult;
  return {
    atkEff,
    defEff,
    defMult,
    atkMult,
    winChance: combatWinChance(atkEff, defEff)
  };
};

type FrontierCombatPreviewFn = ((
  target: FrontierCombatPreviewTile,
  modifiers?: FrontierCombatModifiers
) => FrontierCombatPreview) & {
  __combatModule: symbol;
};

export const buildFrontierCombatPreview: FrontierCombatPreviewFn = Object.assign(buildFrontierCombatPreviewImpl, {
  __combatModule: FRONTIER_COMBAT_MODULE
});

const rollFrontierCombatImpl = (
  target: FrontierCombatPreviewTile,
  _actionType: "ATTACK" | "EXPAND",
  randomValue = Math.random(),
  modifiers: FrontierCombatModifiers = {}
): FrontierCombatPreview & { attackerWon: boolean } => {
  const preview = buildFrontierCombatPreview(target, modifiers);
  return {
    ...preview,
    attackerWon: randomValue < preview.winChance
  };
};

type RollFrontierCombatFn = ((
  target: FrontierCombatPreviewTile,
  actionType: "ATTACK" | "EXPAND",
  randomValue?: number,
  modifiers?: FrontierCombatModifiers
) => FrontierCombatPreview & { attackerWon: boolean }) & {
  __combatModule: symbol;
};

export const rollFrontierCombat: RollFrontierCombatFn = Object.assign(rollFrontierCombatImpl, {
  __combatModule: FRONTIER_COMBAT_MODULE
});
