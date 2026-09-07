import type { ClientState } from "../client-state/client-state.js";

/**
 * The manpower panel's "Active muster flags" list (musterStatusText,
 * client-side-panel-html.ts) shows a live "Fighting at (x, y)" / "Planning
 * next move -- Ns" countdown per flag. That text is only recomputed when the
 * HUD re-renders, which otherwise only happens on an incoming server tile
 * delta or a UI interaction -- with the panel open and no other traffic
 * touching an Advance/March flag, its countdown just sat frozen at whatever
 * second it was on when the panel opened.
 *
 * Re-render once a second, but only while the manpower panel is actually
 * open (desktop or mobile) and the player has at least one non-Hold muster
 * flag out, so this stays as cheap as the other per-second HUD tickers
 * (startTileMenuDecayTicker, renderShardAlert, renderVictoryHoldAlert) it
 * sits alongside, instead of redoing the whole HUD every second regardless
 * of what's on screen.
 */
export const startMusterStatusTicker = (state: ClientState, renderHud: () => void): void => {
  setInterval(() => {
    if (state.activePanel !== "manpower" && state.mobilePanel !== "manpower") return;
    let hasLiveMusterFlag = false;
    for (const tile of state.tiles.values()) {
      if (tile.muster?.ownerId === state.me && tile.muster.mode !== "HOLD") {
        hasLiveMusterFlag = true;
        break;
      }
    }
    if (hasLiveMusterFlag) renderHud();
  }, 1_000);
};
