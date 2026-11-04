// Phone viewport vs. phone layout. `isPhoneViewport()` is the raw 900px
// breakpoint: use it for device budgets (pixel counts, frame gaps, request
// limits). The legacy HUD's phone layout (#mobile-nav, #mobile-sheet) follows
// `isMobile()` in client-panel-nav.ts, which is false while the new HUD's
// compact layout drives the phone: legacy panels then open the way they do on
// desktop, in #side-panel, which the compact HUD restyles for phones.

export const PHONE_VIEWPORT_QUERY = "(max-width: 900px)";

export const isPhoneViewport = (): boolean => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_VIEWPORT_QUERY).matches;
  } catch {
    return false;
  }
};

let compactHud = false;

/** Set by the new HUD's frame each tick (client-hud-v2.ts). */
export const setCompactHudActive = (active: boolean): void => {
  compactHud = active;
};

export const compactHudActive = (): boolean => compactHud;
