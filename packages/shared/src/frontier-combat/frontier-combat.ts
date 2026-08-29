import type { FortVariant } from "../types.js";
import { combatWinChance } from "../math/math.js";
import { BREAKTHROUGH_DEBUFF_MULT } from "../config.js";
import { attackManpowerLossRangeForFort } from "../structure-costs/structure-costs.js";

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

export type FrontierCombatBreakdownEntry = {
  label: string;
  mult: number;
};

// Splits each side's effective power into three tiers so the client can show
// its full "verify the math" breakdown: a flat base, persistent infrastructure
// investment (weapons factories, general tech/domain attack|defense mods —
// the same regardless of who you're fighting), and this-specific-battle
// situational factors (fort/town/dock/siege/tech-vs-target etc). infra and
// battle multipliers always multiply out to the same atkMult/defMult the
// legacy flat fields report.
export type FrontierCombatSideBreakdown = {
  base: number;
  infrastructure: FrontierCombatBreakdownEntry[];
  infrastructureMult: number;
  effectiveBase: number;
  battle: FrontierCombatBreakdownEntry[];
  battleMult: number;
  effective: number;
};

export type FrontierCombatPreview = {
  atkEff: number;
  defEff: number;
  defMult: number;
  atkMult: number;
  winChance: number;
  attacker: FrontierCombatSideBreakdown;
  defender: FrontierCombatSideBreakdown;
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
  // Names exactly which factory type(s) the defender is missing (e.g.
  // "Target missing Umbrite Weapons Factory"), so the breakdown tells the
  // attacker what to look for instead of a generic "no war industry" line.
  // Falls back to a generic label if the caller doesn't supply one.
  noWarIndustryVulnerabilityLabel?: string | undefined;
  // Mirror of noWarIndustryVulnerabilityMult above, but from the defender's
  // side: doubles the defender's effective defense when the ATTACKER owns
  // zero Titanium or zero Umbrite Weapons Factories anywhere in their empire
  // (same NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT constant, applied to the
  // other side) — a defense-side-only field (the defender's own war-industry
  // investment, or lack of it, never affects their own attack).
  noWarIndustryDefenseVulnerabilityMult?: number | undefined;
  // Mirror of noWarIndustryVulnerabilityLabel above, naming which factory
  // type(s) the attacker is missing.
  noWarIndustryDefenseVulnerabilityLabel?: string | undefined;
  // Generic tech/domain "attack"/"defense" stat mods (player.mods.attack /
  // player.mods.defense — recomputeMods in tech-domain-bridge.ts): persistent,
  // empire-wide, and independent of who/what is being fought, same tier as
  // the weapons-factory infrastructure mults above. Each side only ever
  // supplies its own side's field.
  attackerStatMult?: number | undefined;
  defenderStatMult?: number | undefined;
};

// Builds the "missing X Weapons Factory" war-industry breakdown label from
// which factory type(s) a side actually lacks, so the UI names the specific
// building instead of a generic "no war industry" line. `subject` is
// "Target" for the attack-side label (defender is missing) or "Attacker"
// for the defense-side label (attacker is missing).
export const noWarIndustryLabel = (
  subject: "Target" | "Attacker",
  hasTitanium: boolean,
  hasUmbrite: boolean
): string => {
  if (!hasTitanium && !hasUmbrite) return `${subject} missing Titanium & Umbrite Weapons Factory`;
  if (!hasTitanium) return `${subject} missing Titanium Weapons Factory`;
  if (!hasUmbrite) return `${subject} missing Umbrite Weapons Factory`;
  return `${subject} has no war industry`;
};

export const FRONTIER_COMBAT_MODULE = Symbol("frontier-combat");

// The flat power value every empire starts a fight with before any
// infrastructure or battle modifier is applied. Exported so the client can
// render the exact same "base attack/defense" number the server's combat
// math uses (tech tab, launch-attack breakdown) instead of re-deriving it.
export const BASE_COMBAT_POWER = 10;

const baseFortDefenseMult = (variant: FortVariant | undefined): number => {
  if (variant === "TITANIUM_BASTION") return 4;
  if (variant === "THUNDER_BASTION") return 8;
  if (variant === "WOODEN_FORT") return 1.35;
  if (variant === "FORT") return 2.5;
  return 1;
};

type SideMultBreakdown = { entries: FrontierCombatBreakdownEntry[]; mult: number };

// Folds a named multiplier into a running total, recording it as a labeled
// breakdown row only when it actually does something (mult present and != 1)
// so the UI never has to show a meaningless "×1.0" line.
const foldMult = (entries: FrontierCombatBreakdownEntry[], label: string, mult: number | undefined): number => {
  if (mult == null || mult === 1) return 1;
  entries.push({ label, mult });
  return mult;
};

const attackerInfrastructure = (modifiers: FrontierCombatModifiers): SideMultBreakdown => {
  const entries: FrontierCombatBreakdownEntry[] = [];
  let mult = 1;
  mult *= foldMult(entries, "Weapons Workshop", modifiers.weaponsWorkshopAttackMult);
  mult *= foldMult(entries, "Titanium Weapons Factory", modifiers.titaniumWeaponsFactoryAttackMult);
  mult *= foldMult(entries, "Umbrite Weapons Factory", modifiers.umbriteWeaponsFactoryAttackMult);
  mult *= foldMult(entries, "Tech & Domains", modifiers.attackerStatMult);
  return { entries, mult };
};

const defenderInfrastructure = (modifiers: FrontierCombatModifiers): SideMultBreakdown => {
  const entries: FrontierCombatBreakdownEntry[] = [];
  let mult = 1;
  mult *= foldMult(entries, "Weapons Workshop", modifiers.weaponsWorkshopDefenseMult);
  mult *= foldMult(entries, "Titanium Weapons Factory", modifiers.titaniumWeaponsFactoryDefenseMult);
  mult *= foldMult(entries, "Umbrite Weapons Factory", modifiers.umbriteWeaponsFactoryDefenseMult);
  mult *= foldMult(entries, "Tech & Domains", modifiers.defenderStatMult);
  return { entries, mult };
};

const attackerBattle = (target: FrontierCombatPreviewTile, modifiers: FrontierCombatModifiers): SideMultBreakdown => {
  const entries: FrontierCombatBreakdownEntry[] = [];
  let mult = 1;
  mult *= foldMult(entries, "Siege/outpost proximity", modifiers.attackerOutpostMult);
  mult *= foldMult(entries, modifiers.noWarIndustryVulnerabilityLabel ?? "Target has no war industry", modifiers.noWarIndustryVulnerabilityMult);
  mult *= foldMult(entries, "Dock crossing", modifiers.dockAttackMult);
  if (target.ownershipState === "SETTLED") mult *= foldMult(entries, "Tech vs settled tiles", modifiers.attackVsSettledMult);
  if (target.fortVariant) mult *= foldMult(entries, "Tech vs forts", modifiers.attackVsFortsMult);
  if (modifiers.defenderOwnerId?.startsWith("barbarian")) mult *= foldMult(entries, "Tech vs barbarians", modifiers.attackVsBarbariansMult);
  return { entries, mult };
};

const defenderBattle = (target: FrontierCombatPreviewTile, modifiers: FrontierCombatModifiers): SideMultBreakdown => {
  const entries: FrontierCombatBreakdownEntry[] = [];
  // Legacy parity: frontier tiles provide no defensive effective power.
  if (target.ownershipState === "FRONTIER") return { entries, mult: 0 };
  let mult = 1;
  mult *= foldMult(entries, modifiers.noWarIndustryDefenseVulnerabilityLabel ?? "Attacker has no war industry", modifiers.noWarIndustryDefenseVulnerabilityMult);
  mult *= foldMult(entries, "Settled tile", target.ownershipState === "SETTLED" ? 1.3 : undefined);
  mult *= foldMult(entries, "Town", target.townType ? 1.2 : undefined);
  if (target.fortVariant) {
    const baseFortMult = baseFortDefenseMult(target.fortVariant);
    const techMult = modifiers.fortDefenseMult ?? 1;
    const combinedMult = baseFortMult * techMult;
    if (modifiers.fortGarrisonCap != null && modifiers.fortGarrisonCap > 0) {
      const fillRatio = Math.min(1, (modifiers.fortGarrison ?? 0) / modifiers.fortGarrisonCap);
      const garrisonScaledMult = 1 + (combinedMult - 1) * fillRatio;
      entries.push({ label: `Fort (${target.fortVariant}, ${Math.round(fillRatio * 100)}% garrisoned)`, mult: garrisonScaledMult });
      mult *= garrisonScaledMult;
    } else {
      entries.push({ label: `Fort (${target.fortVariant})`, mult: combinedMult });
      mult *= combinedMult;
    }
  }
  if (target.breachShockUntil != null && modifiers.nowMs != null && target.breachShockUntil > modifiers.nowMs) {
    mult *= foldMult(entries, "Breach shock", BREAKTHROUGH_DEBUFF_MULT);
  }
  return { entries, mult };
};

const buildFrontierCombatPreviewImpl = (
  target: FrontierCombatPreviewTile,
  modifiers: FrontierCombatModifiers = {}
): FrontierCombatPreview => {
  const atkInfra = attackerInfrastructure(modifiers);
  const atkBattle = attackerBattle(target, modifiers);
  const atkMult = atkInfra.mult * atkBattle.mult;
  const atkEff = BASE_COMBAT_POWER * atkMult;

  const defInfra = defenderInfrastructure(modifiers);
  const defBattle = defenderBattle(target, modifiers);
  const defMult = defInfra.mult * defBattle.mult;
  const defEff = BASE_COMBAT_POWER * defMult;

  return {
    atkEff,
    defEff,
    defMult,
    atkMult,
    winChance: combatWinChance(atkEff, defEff),
    attacker: {
      base: BASE_COMBAT_POWER,
      infrastructure: atkInfra.entries,
      infrastructureMult: atkInfra.mult,
      effectiveBase: BASE_COMBAT_POWER * atkInfra.mult,
      battle: atkBattle.entries,
      battleMult: atkBattle.mult,
      effective: atkEff
    },
    defender: {
      base: BASE_COMBAT_POWER,
      infrastructure: defInfra.entries,
      infrastructureMult: defInfra.mult,
      effectiveBase: BASE_COMBAT_POWER * defInfra.mult,
      battle: defBattle.entries,
      battleMult: defBattle.mult,
      effective: defEff
    }
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

// Manpower lost committing an attack against a barbarian or FRONTIER target
// (raid-cheap; committed manpower is tiny — 10/15 — well under the SETTLED
// floor). Kept as the old win-cheap/loss-expensive formula since these
// targets never carry a fort and were not part of the settled-attack
// rebalance below.
export const attackManpowerLoss = (committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number => {
  if (committedManpower <= 0) return 0;
  if (attackerWon) return Math.max(10, committedManpower * 0.16);
  const combatRatio = defEff / Math.max(1, atkEff);
  return committedManpower * Math.min(1.25, 0.6 + combatRatio * 0.35);
};

// Expected manpower loss across both outcomes, weighted by win chance —
// used for a UI estimate since the actual loss on any single attack is random.
export const estimatedAttackManpowerLoss = (committedManpower: number, winChance: number, atkEff: number, defEff: number): number => {
  const lossOnWin = attackManpowerLoss(committedManpower, true, atkEff, defEff);
  const lossOnLoss = attackManpowerLoss(committedManpower, false, atkEff, defEff);
  return winChance * lossOnWin + (1 - winChance) * lossOnLoss;
};

// Manpower lost attacking a SETTLED target (fort or no fort): a uniform
// random draw within that fort tier's range (structure-costs.ts), regardless
// of whether the attack wins or loses. Replaces the old win/loss-scaled
// formula for SETTLED targets, which scaled the same direction as win
// chance itself — a stronger attacker already won more often against a
// weaker defender, and used to also pay less per win, compounding the
// advantage. Loss is now purely a function of the target's fortification,
// not the fight's outcome or the power gap.
export const rollSettledAttackManpowerLoss = (fortVariant: FortVariant | undefined, randomValue = Math.random()): number => {
  const { min, max } = attackManpowerLossRangeForFort(fortVariant);
  return min + randomValue * (max - min);
};

// Expected manpower loss for a SETTLED target — the range's midpoint, used
// for a UI estimate before the player commits (the actual loss on any single
// attack is a random draw, independent of predicted win chance).
export const estimatedSettledAttackManpowerLoss = (fortVariant: FortVariant | undefined): number => {
  const { min, max } = attackManpowerLossRangeForFort(fortVariant);
  return (min + max) / 2;
};
