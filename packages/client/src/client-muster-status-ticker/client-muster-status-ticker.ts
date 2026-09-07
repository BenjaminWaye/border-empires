import type { ClientState } from "../client-state/client-state.js";

/**
 * The manpower panel's "Active muster flags" list (musterStatusText,
 * client-side-panel-html.ts) shows a live "Fighting at (x, y)" / "Planning
 * next move -- Ns" countdown per flag, and (since the client started
 * interpolating staged amounts between sparse server ticks -- see
 * client-muster-prediction.ts) a continuously-climbing staged amount for
 * HOLD flags too. That text is only recomputed when the HUD re-renders,
 * which otherwise only happens on an incoming server tile delta or a UI
 * interaction -- with the panel open and no other traffic touching a flag,
 * its countdown/amount just sat frozen at whatever value it was on when the
 * panel opened.
 *
 * Re-render once a second, but only while the manpower panel is actually
 * open (desktop or mobile) and the player has at least one muster flag out
 * (HOLD included, now that HOLD flags animate too), so this stays as cheap
 * as the other per-second HUD tickers (startTileMenuDecayTicker,
 * renderShardAlert, renderVictoryHoldAlert) it sits alongside, instead of
 * redoing the whole HUD every second regardless of what's on screen.
 */
export const startMusterStatusTicker = (state: ClientState, renderHud: () => void): void => {
  setInterval(() => {
    if (state.activePanel !== "manpower" && state.mobilePanel !== "manpower") return;
    let hasLiveMusterFlag = false;
    for (const tile of state.tiles.values()) {
      if (tile.muster?.ownerId === state.me) {
        hasLiveMusterFlag = true;
        break;
      }
    }
    if (hasLiveMusterFlag) renderHud();
  }, 1_000);
};
