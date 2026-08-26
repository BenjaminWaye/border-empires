import { mobileNavLabelHtml } from "../client-panel-nav/client-panel-nav.js";
import type { ClientState } from "../client-state/client-state.js";

// Pulsing badge on the Ally tab (desktop icon strip + mobile bottom nav) for
// pending incoming alliance/truce requests. Kept out of client-hud.ts
// (already at the repo's 500-line growth cap) so the HUD render loop only
// needs a single call site — see renderClientHud.
export const applyAllyAlertNavBadges = (
  state: Pick<ClientState, "incomingAllianceRequests" | "incomingTruceRequests">,
  hud: HTMLElement,
  panelActionButtons: NodeListOf<HTMLButtonElement>
): void => {
  const pendingAllyCount = state.incomingAllianceRequests.length + state.incomingTruceRequests.length;
  const ariaLabel = `${pendingAllyCount} pending alliance/truce request${pendingAllyCount === 1 ? "" : "s"}`;
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel !== "alliance") return;
    btn.innerHTML = pendingAllyCount > 0
      ? `<span class="tab-icon">👥</span><span class="social-alert-dot" aria-label="${ariaLabel}">${Math.min(9, pendingAllyCount)}</span>`
      : '<span class="tab-icon">👥</span>';
  });
  const mobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='social']");
  if (!mobileBtn) return;
  mobileBtn.innerHTML = mobileNavLabelHtml("social", { pendingAllyCount });
};
