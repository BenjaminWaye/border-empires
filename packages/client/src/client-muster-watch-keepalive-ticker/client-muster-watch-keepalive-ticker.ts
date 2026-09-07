import type { ClientState } from "../client-state/client-state.js";

/**
 * WATCH_MUSTER is sent exactly once, when the tile menu opens on an owned
 * muster tile (openSingleTileActionMenu, client-action-flow.ts). The gateway
 * treats it as best-effort: a timeout or gRPC error against the simulation
 * is caught and only logged server-side (gateway-app.ts), never surfaced to
 * the client. If that single send is dropped, the flag silently falls back
 * to the 30s territory-automation sweep for the rest of the session — with
 * the menu still open and the player still watching — instead of the 1s
 * watched-tile tick, and nothing before this ticker ever noticed or
 * recovered.
 *
 * Re-send WATCH_MUSTER once every few seconds while the tile menu is open on
 * an owned muster tile, so a dropped subscription self-heals almost
 * immediately instead of requiring the player to close and reopen the menu.
 * WATCH_MUSTER is idempotent server-side (it just overwrites the watched key
 * for this player), so a redundant resend when the first one actually landed
 * is a no-op.
 */
export const MUSTER_WATCH_KEEPALIVE_INTERVAL_MS = 5_000;

export const startMusterWatchKeepaliveTicker = (
  state: ClientState,
  deps: { sendGameMessage: (payload: unknown) => boolean }
): void => {
  setInterval(() => {
    if (!state.tileActionMenu.visible || state.tileActionMenu.mode !== "single" || !state.tileActionMenu.currentTileKey) return;
    const menuTile = state.tiles.get(state.tileActionMenu.currentTileKey);
    if (!menuTile || menuTile.muster?.ownerId !== state.me) return;
    deps.sendGameMessage({ type: "WATCH_MUSTER", x: menuTile.x, y: menuTile.y });
  }, MUSTER_WATCH_KEEPALIVE_INTERVAL_MS);
};
