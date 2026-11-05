// Where the bottom-left onboarding corner UI (the New empire checklist bubble
// and the tutorial guide card) sits: just above whichever "Center"/AFC
// button is on screen. See client-onboarding-checklist-overlay.ts's header
// for why this is measured instead of a fixed offset.

// Gap kept between the top of the on-screen Center button and the bottom of
// this bubble's launcher circle.
const CLEARANCE_ABOVE_CENTER_BUTTON = 12;
// Fallback for when neither Center button is measurable (missing element,
// or a jsdom/happy-dom test environment where getBoundingClientRect always
// returns a zero rect).
const DEFAULT_BOTTOM_OFFSET_PX = 190;
// Checked in this order -- #center-me-desktop is the desktop #floating-info
// button; #center-me is its mobile #mobile-core equivalent. Whichever is
// actually laid out (not display:none at the current viewport width) wins.
const CENTER_BUTTON_IDS = ["center-me-desktop", "center-me"] as const;

/**
 * Measures whichever Center button is actually on screen right now and
 * returns the `bottom` (px, from the viewport's bottom edge) this bubble's
 * root needs to clear its top edge by CLEARANCE_ABOVE_CENTER_BUTTON. Falls
 * back to the old guessed constant when neither is measurable.
 */
export const bottomOffsetClearingCenterButton = (): number => {
  if (typeof document === "undefined" || typeof window === "undefined") return DEFAULT_BOTTOM_OFFSET_PX;
  for (const id of CENTER_BUTTON_IDS) {
    const button = document.getElementById(id);
    if (!button) continue;
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue; // unlaid-out (display:none, or a test DOM)
    // Clamped to a sane minimum so a pathological layout (button pushed to
    // the very bottom edge, or off-screen) can't collapse this to 0/negative
    // and drop the launcher off the bottom of the viewport.
    return Math.max(60, window.innerHeight - rect.top + CLEARANCE_ABOVE_CENTER_BUTTON);
  }
  return DEFAULT_BOTTOM_OFFSET_PX;
};
