export type NeutralTileClickOutcome = "queue-adjacent-neutral" | "open-menu";

export const neutralTileClickOutcome = (input: {
  isLand: boolean;
  isFogged: boolean;
  hasFrontierOrigin: boolean;
  isNeutral: boolean;
  // True when the target also falls inside the local player's fixed-border
  // reach. A reach-eligible target also qualifies for the "Build Relay
  // Beacon" (expand+settle+build) menu action, which only ever surfaces
  // inside the tile menu -- an in-reach adjacent tile must open that menu
  // instead of silently auto-claiming a bare EXPAND, or the option can
  // never be seen. Out-of-reach adjacent tiles keep the fast one-click
  // claim, since no such choice exists there.
  targetInReach: boolean;
}): NeutralTileClickOutcome => {
  const { isLand, isFogged, hasFrontierOrigin, isNeutral, targetInReach } = input;

  const adjacentNeutralClick = isLand && !isFogged && isNeutral && hasFrontierOrigin && !targetInReach;
  if (adjacentNeutralClick) return "queue-adjacent-neutral";

  return "open-menu";
};
