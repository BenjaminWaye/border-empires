// Which layout of the new HUD drives this frame: the desktop one, the compact
// (phone) one, or none (the legacy HUD). See docs/hud-v2-mobile-plan.md.
//
// A viewport is compact when it is narrow (the client's 900px phone breakpoint)
// or short with a coarse pointer (a phone held sideways, e.g. 932x430). The
// compact layout is opt-in for now (`?hud=compact`): without it, narrow phones
// keep the legacy HUD and landscape phones keep the desktop HUD, as before.

export type HudV2Layout = "desktop" | "compact" | "off";

export type HudV2LayoutInput = {
  /** The HUD v2 flag (on by default; `?hud=legacy` turns it off). */
  enabled: boolean;
  /** The phone opt-in (`?hud=compact`). */
  compactOptIn: boolean;
  /** The client's phone breakpoint: `(max-width: 900px)`. */
  narrow: boolean;
  /** A short viewport with a touch pointer: a phone in landscape. */
  shortTouch: boolean;
};

export const SHORT_TOUCH_QUERY = "(max-height: 500px) and (pointer: coarse)";

export const isCompactViewport = (input: Pick<HudV2LayoutInput, "narrow" | "shortTouch">): boolean => input.narrow || input.shortTouch;

export const selectHudV2Layout = (input: HudV2LayoutInput): HudV2Layout => {
  if (!input.enabled) return "off";
  if (isCompactViewport(input) && input.compactOptIn) return "compact";
  // Phones without the opt-in stay on the legacy HUD until the compact layout ships.
  if (input.narrow) return "off";
  return "desktop";
};

export const shortTouchViewport = (): boolean => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(SHORT_TOUCH_QUERY).matches;
  } catch {
    return false;
  }
};
