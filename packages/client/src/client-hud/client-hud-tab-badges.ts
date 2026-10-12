import { navTabIconHtml, setTabButtonHtml } from "../client-nav-icons/client-nav-icons.js";
import { mobileNavLabelHtml } from "../client-panel-nav/client-panel-nav.js";

// Unread/ready badges on the Tech and Alerts tabs (desktop icon strip) and the
// Core/Tech/Alerts buttons in the mobile bottom nav. Split out of
// renderClientHud so client-hud.ts stays under its line cap.
export type HudTabBadgeState = {
  readonly techReady: boolean;
  readonly attackAlertUnread: boolean;
  readonly feedUnreadCount: number;
  readonly feedAttentionActive: boolean;
};

export const applyHudTabBadges = (
  hud: HTMLElement,
  panelActionButtons: NodeListOf<HTMLButtonElement>,
  { techReady, attackAlertUnread, feedUnreadCount, feedAttentionActive }: HudTabBadgeState
): void => {
  panelActionButtons.forEach((btn) => {
    btn.classList.toggle("feed-attention-pulse", btn.dataset.panel === "feed" && feedAttentionActive);
    if (btn.dataset.panel === "tech") {
      setTabButtonHtml(btn, techReady
        ? navTabIconHtml("tech") + '<span class="tech-ready-dot" aria-label="upgrade available"></span>'
        : navTabIconHtml("tech"));
      return;
    }
    if (btn.dataset.panel === "feed") {
      setTabButtonHtml(btn, attackAlertUnread || feedUnreadCount > 0
        ? `${navTabIconHtml("feed")}<span class="feed-alert-dot" aria-label="${attackAlertUnread ? "under attack" : "new activity"}">${attackAlertUnread ? "!" : Math.min(9, feedUnreadCount)}</span>`
        : navTabIconHtml("feed"));
    }
  });
  const coreMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='core']");
  if (coreMobileBtn) setTabButtonHtml(coreMobileBtn, mobileNavLabelHtml("core"));
  const techMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='tech']");
  if (techMobileBtn) setTabButtonHtml(techMobileBtn, mobileNavLabelHtml("tech", { techReady }));
  const feedMobileBtn = hud.querySelector<HTMLButtonElement>("#mobile-nav button[data-mobile-panel='feed']");
  if (feedMobileBtn) {
    setTabButtonHtml(feedMobileBtn, mobileNavLabelHtml("feed", { attackAlertUnread, feedUnreadCount }));
    feedMobileBtn.classList.toggle("feed-attention-pulse", feedAttentionActive);
  }
};
