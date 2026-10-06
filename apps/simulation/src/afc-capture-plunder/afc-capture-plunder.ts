import type { DomainTileState } from "@border-empires/game-domain";

/** Share of the defender's Coin an attacker plunders on top of the normal pillage when capturing an AFC. */
export const AFC_CAPTURE_PLUNDER_SHARE = 0.33;

/**
 * Extra Coin taken when an attacker captures another player's AFC: 33% of
 * whatever the defender still holds after the normal settled-tile pillage
 * (regularDefenderGoldLoss), so the two never take more than the defender has.
 */
export const afcCapturePlunderGold = (input: {
  attackerWon: boolean;
  attackerId: string;
  previousTarget: DomainTileState | undefined;
  defenderPoints: number | undefined;
  regularDefenderGoldLoss: number;
}): number => {
  const { previousTarget } = input;
  if (!input.attackerWon || input.defenderPoints === undefined || !previousTarget?.afc || !previousTarget.ownerId) return 0;
  if (previousTarget.ownerId === input.attackerId || previousTarget.afc.ownerId !== previousTarget.ownerId) return 0;
  return Math.floor(Math.max(0, input.defenderPoints - input.regularDefenderGoldLoss) * AFC_CAPTURE_PLUNDER_SHARE);
};

/** The combat result as reported to clients, with AFC plunder folded into pillagedGold. */
export const withAfcCapturePlunder = <T extends { pillagedGold: number }>(result: T | undefined, plunder: number): T | undefined =>
  result && plunder > 0 ? { ...result, pillagedGold: result.pillagedGold + plunder } : result;
