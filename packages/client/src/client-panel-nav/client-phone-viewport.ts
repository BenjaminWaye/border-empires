// The raw 900px phone breakpoint: use it for device budgets (pixel counts,
// frame gaps, request limits). Layout follows the HUD's own selector
// (client-hud-v2-layout.ts), which also treats a phone held sideways as compact.

export const PHONE_VIEWPORT_QUERY = "(max-width: 900px)";

export const isPhoneViewport = (): boolean => {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_VIEWPORT_QUERY).matches;
  } catch {
    return false;
  }
};
