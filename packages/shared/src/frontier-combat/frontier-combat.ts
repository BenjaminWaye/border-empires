import type { FortVariant } from "../types.js";
import { combatWinChance } from "../math/math.js";
import { BREAKTHROUGH_DEBUFF_MULT } from "../config.js";

export type FrontierCombatPreviewTile = {
  terrain?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
  // Fort variant if the target tile has an active (not under-construction) fort owned by the defender.
  fortVariant?: FortVariant | undefined;
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
  // Applied when the attack originates from a dock-crossing (origin tile is an owned dock).
  dockAttackMult?: number | undefined;
  attackVsSettledMult?: number;
  attackVsFortsMult?: number;
  attackVsBarbariansMult?: number;
  defenderOwnerId?: string | undefined;
  fortDefenseMult?: number;
  // Garrison scaling: when set, fort defense is proportional to fill ratio.
  fortGarrison?: number | undefined;
  fortGarrisonCap?: number | undefined;
  // Breakthrough momentum: current timestamp for breach-window check.
  nowMs?: number | undefined;
  // Weapons Workshop (retired — see structure-registry-economic.ts, replaced
  // by Titanium/Umbrite Weapons Factory below): an empire-wide attack/defense
  // multiplier derived from how many the attacker/defender owns
  // (WEAPONS_WORKSHOP_*_MULT_PER_BUILDING in config.ts), kept wired for any
  // copy a player already owns. Attacker's mult feeds atkMult, defender's
  // feeds defMult — each side only ever supplies its own side's field.
  weaponsWorkshopAttackMult?: number | undefined;
  weaponsWorkshopDefenseMult?: number | undefined;
  // Titanium/Umbrite Weapons Factory: like Weapons Workshop above, but the count
  // behind each multiplier is scoped to the connected-town network relevant
  // to that side of the fight (runtime-combat-support.ts), not a flat
  // empire-wide sum — see TITANIUM_WEAPONS_FACTORY_*_MULT_PER_BUILDING /
  // UMBRITE_WEAPONS_FACTORY_*_MULT_PER_BUILDING in config.ts.
  titaniumWeaponsFactoryAttackMult?: number | undefined;
  titaniumWeaponsFactoryDefenseMult?: number | undefined;
  umbriteWeaponsFactoryAttackMult?: number | undefined;
  umbriteWeaponsFactoryDefenseMult?: number | undefined;
  // "Unarmed" vulnerability: doubles the attacker's effective attack when the
  // defender owns zero Titanium or zero Umbrite Weapons Factories anywhere in their
  // empire (NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT in config.ts) — an
  // attack-side-only field (the attacker's own war-industry investment,
  // or lack of it, never affects their own defense).
  noWarIndustryVulnerabilityMult?: number | undefined;
};

export const FRONTIER_COMBAT_MODULE = Symbol("frontier-combat");

const baseFortDefenseMult = (variant: FortVariant | undefined): number => {
  if (variant === "TITANIUM_BASTION") return 4;
  if (variant === "THUNDER_BASTION") return 8;
  if (variant === "WOODEN_FORT") return 1.35;
  if (variant === "FORT") return 2.5;
  return 1;
};

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
  if (target.fortVariant) {
    const baseFortMult = baseFortDefenseMult(target.fortVariant);
    const techMult = modifiers.fortDefenseMult ?? 1;
    const combinedMult = baseFortMult * techMult;
    if (modifiers.fortGarrisonCap != null && modifiers.fortGarrisonCap > 0) {
      const fillRatio = Math.min(1, (modifiers.fortGarrison ?? 0) / modifiers.fortGarrisonCap);
      defMult *= 1 + (combinedMult - 1) * fillRatio;
    } else {
      defMult *= combinedMult;
    }
  }
  if (target.breachShockUntil != null && modifiers.nowMs != null && target.breachShockUntil > modifiers.nowMs) {
    defMult *= BREAKTHROUGH_DEBUFF_MULT;
  }
  if (modifiers.weaponsWorkshopDefenseMult != null) defMult *= modifiers.weaponsWorkshopDefenseMult;
  if (modifiers.titaniumWeaponsFactoryDefenseMult != null) defMult *= modifiers.titaniumWeaponsFactoryDefenseMult;
  if (modifiers.umbriteWeaponsFactoryDefenseMult != null) defMult *= modifiers.umbriteWeaponsFactoryDefenseMult;
  return defMult;
};

const buildFrontierCombatPreviewImpl = (
  target: FrontierCombatPreviewTile,
  modifiers: FrontierCombatModifiers = {}
): FrontierCombatPreview => {
  let atkMult = modifiers.attackerOutpostMult ?? 1;
  if (modifiers.weaponsWorkshopAttackMult != null) atkMult *= modifiers.weaponsWorkshopAttackMult;
  if (modifiers.titaniumWeaponsFactoryAttackMult != null) atkMult *= modifiers.titaniumWeaponsFactoryAttackMult;
  if (modifiers.umbriteWeaponsFactoryAttackMult != null) atkMult *= modifiers.umbriteWeaponsFactoryAttackMult;
  if (modifiers.noWarIndustryVulnerabilityMult != null) atkMult *= modifiers.noWarIndustryVulnerabilityMult;
  if (modifiers.dockAttackMult != null) atkMult *= modifiers.dockAttackMult;
  if (target.ownershipState === "SETTLED") atkMult *= modifiers.attackVsSettledMult ?? 1;
  if (target.fortVariant) atkMult *= modifiers.attackVsFortsMult ?? 1;
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
