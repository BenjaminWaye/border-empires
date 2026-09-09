import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

/**
 * The tile menu's muster action rows (buildMusterActions,
 * client-muster-tile-actions.ts) show a "staged"/"cap" readout that's now
 * interpolated between sparse server ticks (client-muster-prediction.ts).
 * That text is only recomputed when the open menu re-renders, which
 * otherwise only happens on an incoming server message -- with the menu
 * open on a muster tile and no other traffic touching it, the staged
 * number just sat frozen at whatever value it was on when the menu opened,
 * defeating the point of interpolating it.
 *
 * Repaints at ~250ms (faster than the 1s cadence of the other per-second
 * HUD tickers -- startTileMenuDecayTicker, startMusterStatusTicker -- since
 * a manpower bar climbing in whole-second steps still reads as choppy) but
 * only while a muster tile's menu is actually open. Uses the same lighter
 * tileMenuViewForTile + renderTileActionMenu pair startTileMenuDecayTicker
 * uses, not openSingleTileActionMenu, which also redoes preview/tab
 * bookkeeping this repaint doesn't need every quarter-second.
 */
export const MUSTER_MENU_REPAINT_INTERVAL_MS = 250;

export const startMusterMenuRepaintTicker = (
  state: ClientState,
  tileMenuViewForTile: (tile: Tile) => TileMenuView,
  renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void
): void => {
  setInterval(() => {
    if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single" || !state.tileActionMenu.currentTileKey) return;
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (!menuTile?.muster || menuTile.ownerId !== state.me) return;
    renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }, MUSTER_MENU_REPAINT_INTERVAL_MS);
};
