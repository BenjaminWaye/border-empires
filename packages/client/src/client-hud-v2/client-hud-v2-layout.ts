// Which layout of the HUD draws this frame: the desktop one or the compact
// (phone) one. See docs/hud-v2-mobile-plan.md.
//
// A viewport is compact when it is narrow (the client's 900px phone breakpoint)
// or short with a coarse pointer (a phone held sideways, e.g. 932x430).

import { isPhoneViewport } from "../client-panel-nav/client-phone-viewport.js";

export type HudV2Layout = "desktop" | "compact";

export type HudV2LayoutInput = {
  /** The client's phone breakpoint: `(max-width: 900px)`. */
  narrow: boolean;
  /** A short viewport with a touch pointer: a phone in landscape. */
  shortTouch: boolean;
};

export const SHORT_TOUCH_QUERY = "(max-height: 500px) and (pointer: coarse)";

export const isCompactViewport = (input: HudV2LayoutInput): boolean => input.narrow || input.shortTouch;

export const selectHudV2Layout = (input: HudV2LayoutInput): HudV2Layout => (isCompactViewport(input) ? "compact" : "desktop");

export const shortTouchViewport = (): boolean => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(SHORT_TOUCH_QUERY).matches;
  } catch {
    return false;
  }
};

export const currentHudV2Layout = (narrow: () => boolean = isPhoneViewport): HudV2Layout =>
  selectHudV2Layout({ narrow: narrow(), shortTouch: shortTouchViewport() });
