export type NeutralTileClickOutcome = "warn-unreachable-enemy" | "queue-adjacent-neutral" | "open-menu";

export const neutralTileClickOutcome = (input: {
  isLand: boolean;
  isFogged: boolean;
  isOwnedByEnemy: boolean;
  isOwnedByAlly: boolean;
  hasAdjacentOwnedOrigin: boolean;
  hasFrontierOrigin: boolean;
  hasDock: boolean;
  isNeutral: boolean;
}): NeutralTileClickOutcome => {
  const {
    isLand,
    isFogged,
    isOwnedByEnemy,
    isOwnedByAlly,
    hasAdjacentOwnedOrigin,
    hasFrontierOrigin,
    hasDock,
    isNeutral
  } = input;

  const unreachableEnemyClick =
    isLand && !isFogged && isOwnedByEnemy && !isOwnedByAlly && !hasAdjacentOwnedOrigin && !hasDock;
  if (unreachableEnemyClick) return "warn-unreachable-enemy";

  const adjacentNeutralClick = isLand && !isFogged && isNeutral && hasFrontierOrigin;
  if (adjacentNeutralClick) return "queue-adjacent-neutral";

  return "open-menu";
};
