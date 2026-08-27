import type { ClientState } from "../client-state/client-state.js";

/**
 * The tile menu header status (tileMenuHeaderStatusForTile,
 * client-tile-menu-status.ts) shows a live "disappears in Xs" / "decays in
 * Xs" countdown for an encircled or out-of-reach frontier tile. That text is
 * only recomputed when renderHud() runs, which otherwise only happens on an
 * incoming server message -- with the menu open on a decaying tile and no
 * other traffic touching it, the countdown just sat frozen at whatever
 * second it was on when the menu opened, reading as if there were no timer
 * at all (reported for the tile menu's Overview tab, but the same header
 * status shows on every tab).
 *
 * Re-render once a second, but only while a decaying tile's menu is
 * actually open, so this stays as cheap as the other per-second HUD tickers
 * (renderShardAlert, renderVictoryHoldAlert) it sits alongside.
 */
export const startTileMenuDecayTicker = (state: ClientState, renderHud: () => void): void => {
  setInterval(() => {
    if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single" || !state.tileActionMenu.currentTileKey) return;
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (menuTile?.frontierDecayAt === undefined) return;
    renderHud();
  }, 1_000);
};
