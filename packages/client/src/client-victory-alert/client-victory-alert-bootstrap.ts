import { acknowledgeVictoryHoldAlert as acknowledgeVictoryHoldAlertFromModule } from "../client-alerts/client-alerts.js";
import { renderVictoryHoldAlert as renderVictoryHoldAlertFromModule } from "../client-capture-effects/client-capture-effects.js";
import type { ClientState } from "../client-state/client-state.js";

// Small factory so client-bootstrap.ts (already at the repo's 500-line
// growth cap) only needs a single call site to wire up the render/acknowledge
// closures, instead of an inline multi-line const definition.
export const createVictoryHoldAlertHandlers = (
  state: ClientState,
  dom: {
    victoryAlertOverlayEl: HTMLElement;
    victoryAlertTitleEl: HTMLElement;
    victoryAlertDetailEl: HTMLElement;
    victoryAlertBannerBtn: HTMLButtonElement;
  }
): { renderVictoryHoldAlert: () => void; acknowledgeVictoryHoldAlert: () => void } => ({
  renderVictoryHoldAlert: () =>
    renderVictoryHoldAlertFromModule(state, {
      victoryAlertOverlayEl: dom.victoryAlertOverlayEl,
      victoryAlertTitleEl: dom.victoryAlertTitleEl,
      victoryAlertDetailEl: dom.victoryAlertDetailEl,
      victoryAlertBannerBtn: dom.victoryAlertBannerBtn
    }),
  acknowledgeVictoryHoldAlert: () => acknowledgeVictoryHoldAlertFromModule(state)
});
