export type NeutralTileClickOutcome = "queue-adjacent-neutral" | "open-menu";

/**
 * How a map selection arrived. A "touch" tap only inspects: it opens the tile
 * sheet, whose Expand To button is the explicit claim. On a phone the tiles
 * are a few pixels wide and the camera can move between aim and tap, so a tap
 * meant as "what is this?" used to spend manpower on the tile next door with
 * no confirm (2026-11-12 playtest). A "mouse" click is precise and keeps the
 * one-click claim on an adjacent neutral tile, so desktop expansion stays fast.
 */
export type TileTapInput = "mouse" | "touch";

/** True when a tap on a claimable tile next to the border should claim it straight away instead of opening its sheet. */
export const tapClaimsAdjacentTile = (tapInput: TileTapInput): boolean => tapInput === "mouse";

export const neutralTileClickOutcome = (input: {
  isLand: boolean;
  isFogged: boolean;
  hasFrontierOrigin: boolean;
  isNeutral: boolean;
  tapInput: TileTapInput;
}): NeutralTileClickOutcome => {
  const { isLand, isFogged, hasFrontierOrigin, isNeutral, tapInput } = input;

  const adjacentNeutralClick = isLand && !isFogged && isNeutral && hasFrontierOrigin;
  if (adjacentNeutralClick && tapClaimsAdjacentTile(tapInput)) return "queue-adjacent-neutral";

  return "open-menu";
};
