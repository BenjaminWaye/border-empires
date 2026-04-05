export type NeutralTileClickOutcome = "queue-adjacent-neutral" | "open-menu";

export const neutralTileClickOutcome = (input: {
  isLand: boolean;
  isFogged: boolean;
  hasFrontierOrigin: boolean;
  isNeutral: boolean;
}): NeutralTileClickOutcome => {
  const { isLand, isFogged, hasFrontierOrigin, isNeutral } = input;

  const adjacentNeutralClick = isLand && !isFogged && isNeutral && hasFrontierOrigin;
  if (adjacentNeutralClick) return "queue-adjacent-neutral";

  return "open-menu";
};
