// #map-loading-overlay lives inside #hud, which is position: fixed and so its
// own stacking context: no z-index lifts the banner over body-level cards
// such as the tutorial guide (#tutorial-guide-root), the new-empire checklist
// (.onb-root) or a discovery tip. A playtest lost the "Server update in
// progress" banner under the guide card. While an in-game reconnect banner is
// up, the body class raises it over the HUD's own cards and hides the
// body-level ones (client-deploy-countdown.css). Before the first INIT the
// banner stays under the sign-in overlay, as before.
export const RECONNECT_BANNER_BODY_CLASS = "map-reconnect-banner";

export const syncReconnectBannerLayer = (body: HTMLElement | undefined, inGameBannerVisible: boolean): void => {
  body?.classList.toggle(RECONNECT_BANNER_BODY_CLASS, inGameBannerVisible);
};
