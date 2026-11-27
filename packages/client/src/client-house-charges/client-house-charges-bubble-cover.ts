// When the House Charges bubble steps aside. The docked "0/2" cards (and their "Showing: …" note) sit at the
// map's left edge, where they drew over the tile sheet's title and primary button, the Expansion-queued
// popup's Center button and the Build list (playtest 2026-11-26). While any of those is open the bubble
// hides, without counting the deal as handled; it comes back once they close.

/** Surfaces the bubble must never draw over: the tile sheet, the Build list, a placement bar, the capture popup. */
const COVERING_SELECTORS = ["#hud-v2-tile:not([hidden])", "#hud-v2-build:not([hidden])"] as const;
/** Shown and hidden with an inline display (client-capture-effects.ts; the placement bar, client-afc-recovery.ts). */
const INLINE_DISPLAY_IDS = ["capture-card", "placement-overlay"] as const;

const shownInline = (el: HTMLElement | null): boolean => el !== null && el.style.display !== "" && el.style.display !== "none";

/** True while a sheet, popup or modal the bubble would cover is open. */
export const houseChargesBubbleCovered = (doc: Document): boolean =>
  COVERING_SELECTORS.some((selector) => doc.querySelector(selector) !== null) ||
  INLINE_DISPLAY_IDS.some((id) => shownInline(doc.getElementById(id)));
