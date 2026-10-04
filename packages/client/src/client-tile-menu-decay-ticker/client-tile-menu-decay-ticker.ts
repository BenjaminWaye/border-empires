import { hasRenderedBattleStatus } from "../client-battle-progress/client-tracked-battle-progress.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

/**
 * The tile menu header status (tileMenuHeaderStatusForTile,
 * client-tile-menu-status.ts) shows a live "disappears in Xs" / "decays in
 * Xs" countdown for an encircled or out-of-reach frontier tile. That text is
 * only recomputed when the open menu re-renders, which otherwise only
 * happens on an incoming server message -- with the menu open on a decaying
 * tile and no other traffic touching it, the countdown just sat frozen at
 * whatever second it was on when the menu opened, reading as if there were
 * no timer at all (reported for the tile menu's Overview tab, but the same
 * header status shows on every tab).
 *
 * Also refresh battle countdowns and clear their text after the map animation ends.
 * Re-render once a second, but only while a decaying or battling tile's menu is
 * actually open, so this stays as cheap as the other per-second HUD tickers
 * (renderShardAlert, renderVictoryHoldAlert) it sits alongside. This calls
 * renderTileActionMenu directly (the same call renderHud makes internally
 * for an open single-tile menu) rather than the full renderHud -- a plain
 * renderHud() would also redo the economy/domains panels, minimap, and
 * every other HUD section every second purely to refresh a few words of
 * countdown text.
 */
export const startTileMenuDecayTicker = (
  state: ClientState,
  tileMenuViewForTile: (tile: Tile) => TileMenuView,
  renderTileActionMenu: (view: TileMenuView, clientX: number, clientY: number) => void
): void => {
  let lastBattleTileKey = "";
  setInterval(() => {
    if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single" || !state.tileActionMenu.currentTileKey) return;
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (!menuTile) return;
    const key = state.tileActionMenu.currentTileKey;
    const nowMs = Date.now();
    const capture = state.capture;
    const outgoing = state.outgoingMusterAttacksByTile?.get(key);
    const hasBattle = !menuTile.fogged && Boolean(
      (capture?.actionType === "ATTACK" && capture.target.x === menuTile.x && capture.target.y === menuTile.y && capture.resolvesAt > nowMs) ||
      (menuTile.ownerId === state.me && (state.incomingAttacksByTile?.get(key)?.resolvesAt ?? 0) > nowMs) ||
      (outgoing && !outgoing.isExpand && outgoing.resolvesAt > nowMs) ||
      (state.activeBattles?.get(key)?.endAt ?? 0) > nowMs
    );
    // Repaint once after expiry, even if the map loop already pruned the FX.
    const battleEnded = lastBattleTileKey === key || hasRenderedBattleStatus(state.tileActionMenu.renderSignature);
    lastBattleTileKey = hasBattle ? key : "";
    if (menuTile.frontierDecayAt === undefined && !hasBattle && !battleEnded) return;
    renderTileActionMenu(tileMenuViewForTile(menuTile), state.tileActionMenu.x, state.tileActionMenu.y);
  }, 1_000);
};
