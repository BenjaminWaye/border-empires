import { combatWinChance } from "./math.js";

export type FrontierCombatPreviewTile = {
  terrain?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  townType?: string | undefined;
};

export type FrontierCombatPreview = {
  atkEff: number;
  defEff: number;
  defMult: number;
  atkMult: number;
  winChance: number;
};

export type FrontierCombatModifiers = {
  attackerOutpostMult?: number;
};

export const FRONTIER_COMBAT_MODULE = Symbol("frontier-combat");

const defenseMultiplierForTile = (target: FrontierCombatPreviewTile): number => {
  // Legacy parity: frontier tiles provide no defensive effective power.
  if (target.ownershipState === "FRONTIER") return 0;
  let defMult = 1;
  if (target.ownershipState === "SETTLED") defMult *= 1.35;
  if (target.townType) defMult *= 1.2;
  if (target.dockId) defMult *= 1.1;
  if (target.terrain === "MOUNTAIN") defMult *= 1.15;
  return defMult;
};

const buildFrontierCombatPreviewImpl = (
  target: FrontierCombatPreviewTile,
  modifiers: FrontierCombatModifiers = {}
): FrontierCombatPreview => {
  const atkMult = modifiers.attackerOutpostMult ?? 1;
  const atkEff = 10 * atkMult;
  const defMult = defenseMultiplierForTile(target);
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
