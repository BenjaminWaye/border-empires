import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/**
 * The Launch Attack panel's win-chance line/breakdown reads from a preview
 * cached with a 5s TTL (ATTACK_PREVIEW_CACHE_TTL_MS, client-queue-logic.ts).
 * Nothing re-requested that preview once it aged out -- so a player who left
 * an enemy tile's menu open past 5s would watch the win chance and "how this
 * is calculated" breakdown vanish on the next unrelated re-render (a routine
 * TILE_DELTA_BATCH tick, for example), even though nothing about the combat
 * math had actually changed.
 *
 * Re-request once a second, but only while a single-tile menu is open on an
 * attackable enemy tile and the current preview has actually gone stale, so
 * this stays as cheap as the other per-second HUD tickers (renderShardAlert,
 * startTileMenuDecayTicker) it sits alongside. The response handler in
 * client-network.ts (ATTACK_PREVIEW_RESULT) already re-renders the open menu
 * once the fresh preview lands, so this ticker only needs to fire the
 * request -- not repaint anything itself.
 */
export const startAttackPreviewKeepaliveTicker = (
  state: ClientState,
  deps: {
    isTileOwnedByAlly: (tile: Tile) => boolean;
    attackPreviewIsStaleForTarget: (tile: Tile) => boolean;
    requestAttackPreviewForTarget: (tile: Tile) => void;
  }
): void => {
  setInterval(() => {
    if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single" || !state.tileActionMenu.currentTileKey) return;
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (!menuTile || !menuTile.ownerId || menuTile.ownerId === state.me || deps.isTileOwnedByAlly(menuTile)) return;
    if (!deps.attackPreviewIsStaleForTarget(menuTile)) return;
    deps.requestAttackPreviewForTarget(menuTile);
  }, 1_000);
};
