import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";

export const testCombat = (overrides: Partial<CombatManpowerLoss> = {}): CombatManpowerLoss => ({
  attackerId: "me",
  defenderId: "maren",
  attackerWon: false,
  manpowerLoss: 50,
  x: 10,
  y: 10,
  at: 1_000,
  pillagedGold: 0,
  defenderGoldLoss: 0,
  targetWasSettled: true,
  ...overrides
});

export const testFlip = (overrides: Partial<TerritoryFlip> = {}): TerritoryFlip => ({
  tileId: "10,10",
  x: 10,
  y: 10,
  fromOwner: "maren",
  toOwner: "me",
  at: 1_000,
  ...overrides
});
