/**
 * Tiles a player may garrison (SETTLE) even when they sit outside the
 * player's reach. Manual Garrison must accept every tile the automatic paths
 * already garrison out of reach, otherwise the tile menu refuses what the sim
 * does on its own:
 *  - towns/docks are reach anchors -- they produce their own reach once
 *    settled, so requiring pre-existing reach is circular;
 *  - captured buildings (fort, observatory, economic structure, AFC) are
 *    auto-settled on capture (capturedTileWillAutoSettle in the simulation),
 *    since an idle frontier building produces nothing and is barely defensible.
 */
export type SettleReachExemptionTile = {
  town?: unknown;
  dockId?: unknown;
  fort?: unknown;
  observatory?: unknown;
  economicStructure?: unknown;
  afc?: unknown;
};

export const settleIgnoresReach = (tile: SettleReachExemptionTile): boolean =>
  Boolean(tile.town || tile.dockId || tile.fort || tile.observatory || tile.economicStructure || tile.afc);
