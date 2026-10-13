import { mobileNavLabelHtml } from "../client-panel-nav/client-panel-nav.js";
import type { ClientState } from "../client-state/client-state.js";
import { navTabIconHtml, setTabButtonHtml } from "../client-nav-icons/client-nav-icons.js";

// Pulsing badge on the leaderboard tab (desktop icon strip + mobile bottom
// nav) while a season-victory hold alert hasn't been acknowledged yet. Kept
// out of client-hud.ts (already at the repo's 500-line growth cap) so the
// HUD render loop only needs a single call site — see renderClientHud.
export const applyVictoryHoldAlertNavBadges = (
  state: Pick<ClientState, "victoryHoldAlert" | "victoryHoldAlertCollapsed">,
  hud: HTMLElement,
  panelActionButtons: NodeListOf<HTMLButtonElement>
): void => {
  const unacknowledged = Boolean(state.victoryHoldAlert) && !state.victoryHoldAlertCollapsed;
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel !== "leaderboard") return;
    btn.classList.toggle("feed-attention-pulse", unacknowledged);
    setTabButtonHtml(btn, unacknowledged
      ? navTabIconHtml("leaderboard") + '<span class="feed-alert-dot" aria-label="season victory pressure">!</span>'
      : navTabIconHtml("leaderboard"));
  });
  const mobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='leaderboard']");
  if (!mobileBtn) return;
  setTabButtonHtml(mobileBtn, mobileNavLabelHtml("leaderboard", { victoryHoldAlertUnacknowledged: unacknowledged }));
  mobileBtn.classList.toggle("feed-attention-pulse", unacknowledged);
};
