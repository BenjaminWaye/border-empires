import type { ClientState } from "../client-state/client-state.js";

type TileActionMenuState = Pick<ClientState["tileActionMenu"], "visible" | "mode" | "currentTileKey">;

// TILE_DELTA only forces a renderHud() when it resolves a queued frontier
// capture, so any other update (a fort/observatory/siege-outpost/economic-
// structure flipping from under_construction to active, for example) lands
// in state.tiles but the open single-tile action menu popup keeps rendering
// its stale cached view until some unrelated event happens to call
// renderHud(). That's what can leave the "Progress" tab stuck at
// "Remaining 00:00" indefinitely even after the server completes
// construction. Callers should force a renderHud() when this returns true.
export const tileDeltaTouchesOpenTileMenu = (
  state: { tileActionMenu: TileActionMenuState },
  updates: Array<{ x: number; y: number }>,
  keyFor: (x: number, y: number) => string
): boolean => {
  const openTileMenuKey =
    state.tileActionMenu?.visible && state.tileActionMenu.mode === "single" ? state.tileActionMenu.currentTileKey : "";
  return Boolean(openTileMenuKey) && updates.some((update) => keyFor(update.x, update.y) === openTileMenuKey);
};
