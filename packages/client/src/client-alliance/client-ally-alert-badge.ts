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
  const badgeHtml = mobileNavLabelHtml("social", { pendingAllyCount });
  panelActionButtons.forEach((btn) => {
    if (btn.dataset.panel !== "alliance") return;
    btn.innerHTML = badgeHtml;
  });
  const mobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='social']");
  if (!mobileBtn) return;
  mobileBtn.innerHTML = badgeHtml;
};
