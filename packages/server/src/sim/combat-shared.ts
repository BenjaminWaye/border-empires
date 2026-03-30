import { combatWinChance, randomFactor } from "@border-empires/shared";

export type CombatResolutionRequest = {
  attackBase: number;
  defenseBase: number;
};

export type CombatResolutionResult = {
  atkEff: number;
  defEff: number;
  winChance: number;
  win: boolean;
};

export const resolveCombatRoll = (request: CombatResolutionRequest): CombatResolutionResult => {
  const atkEff = request.attackBase * randomFactor();
  const defEff = request.defenseBase * randomFactor();
  const winChance = combatWinChance(atkEff, defEff);
  return {
    atkEff,
    defEff,
    winChance,
    win: Math.random() < winChance
  };
};
