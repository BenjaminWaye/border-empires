import { combatWinChance } from "./math.js";

const BREAKTHROUGH_DEF_MULT_FACTOR = 0.6;

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
  winChance: number;
  breakthroughWinChance: number;
};

export const FRONTIER_COMBAT_MODULE = Symbol("frontier-combat");

const defenseMultiplierForTile = (target: FrontierCombatPreviewTile): number => {
  let defMult = 1;
  if (target.ownershipState === "FRONTIER") defMult *= 1.1;
  if (target.ownershipState === "SETTLED") defMult *= 1.35;
  if (target.townType) defMult *= 1.2;
  if (target.dockId) defMult *= 1.1;
  if (target.terrain === "MOUNTAIN") defMult *= 1.15;
  return defMult;
};

const buildFrontierCombatPreviewImpl = (target: FrontierCombatPreviewTile): FrontierCombatPreview => {
  const atkEff = 10;
  const defMult = defenseMultiplierForTile(target);
  const defEff = 10 * defMult;
  return {
    atkEff,
    defEff,
    defMult,
    winChance: combatWinChance(atkEff, defEff),
    breakthroughWinChance: combatWinChance(atkEff, defEff * BREAKTHROUGH_DEF_MULT_FACTOR)
  };
};

type FrontierCombatPreviewFn = ((target: FrontierCombatPreviewTile) => FrontierCombatPreview) & {
  __combatModule: symbol;
};

export const buildFrontierCombatPreview: FrontierCombatPreviewFn = Object.assign(buildFrontierCombatPreviewImpl, {
  __combatModule: FRONTIER_COMBAT_MODULE
});

const rollFrontierCombatImpl = (
  target: FrontierCombatPreviewTile,
  actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK",
  randomValue = Math.random()
): FrontierCombatPreview & { attackerWon: boolean } => {
  const preview = buildFrontierCombatPreview(target);
  const chance = actionType === "BREAKTHROUGH_ATTACK" ? preview.breakthroughWinChance : preview.winChance;
  return {
    ...preview,
    attackerWon: randomValue < chance
  };
};

type RollFrontierCombatFn = ((
  target: FrontierCombatPreviewTile,
  actionType: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK",
  randomValue?: number
) => FrontierCombatPreview & { attackerWon: boolean }) & {
  __combatModule: symbol;
};

export const rollFrontierCombat: RollFrontierCombatFn = Object.assign(rollFrontierCombatImpl, {
  __combatModule: FRONTIER_COMBAT_MODULE
});
