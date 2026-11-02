// Points at a HUD button for the current guide step (the manpower gauge,
// the Manifest button, the Activity button) with a pulsing outline drawn
// over it. The outline is a separate fixed-position element with
// `pointer-events: none`, so the button underneath stays fully clickable,
// and there is no dimming scrim: the rest of the UI and the map are
// untouched. Pure DOM, so it is identical under the 2D and true-3D map
// renderers. If no matching button is on screen (another HUD layout, a
// collapsed nav), nothing is drawn and the card's text still guides.

import type { GuideAnchorId } from "./tutorial-guide-steps.js";

const OUTLINE_ID = "tutorial-guide-anchor-outline";
const OUTLINE_PADDING_PX = 4;

export const GUIDE_ANCHOR_SELECTORS: Record<GuideAnchorId, string> = {
  manpower: ".stat-chip-manpower",
  manifest: '[data-panel="tech"], [data-mobile-panel="tech"]',
  activity: "[data-open-activity-dashboard]"
};

/** The first matching element that is actually laid out on screen. */
export const findGuideAnchorElement = (anchor: GuideAnchorId, root: ParentNode = document): Element | undefined => {
  for (const el of Array.from(root.querySelectorAll(GUIDE_ANCHOR_SELECTORS[anchor]))) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return undefined;
};

export const removeGuideAnchorOutline = (): void => {
  if (typeof document === "undefined") return;
  document.getElementById(OUTLINE_ID)?.remove();
};

/** Call each frame while a step has an anchor; cheap (one element lookup and rect read). */
export const syncGuideAnchorOutline = (anchor: GuideAnchorId | undefined): void => {
  if (typeof document === "undefined") return;
  const target = anchor ? findGuideAnchorElement(anchor) : undefined;
  if (!target) {
    removeGuideAnchorOutline();
    return;
  }
  injectStyles();
  let outline = document.getElementById(OUTLINE_ID);
  if (!outline) {
    outline = document.createElement("div");
    outline.id = OUTLINE_ID;
    outline.setAttribute("aria-hidden", "true");
    document.body.appendChild(outline);
  }
  const rect = target.getBoundingClientRect();
  outline.style.left = `${rect.left - OUTLINE_PADDING_PX}px`;
  outline.style.top = `${rect.top - OUTLINE_PADDING_PX}px`;
  outline.style.width = `${rect.width + OUTLINE_PADDING_PX * 2}px`;
  outline.style.height = `${rect.height + OUTLINE_PADDING_PX * 2}px`;
};

const STYLE_ID = "tutorial-guide-anchor-styles";
const injectStyles = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${OUTLINE_ID} {
  position: fixed; z-index: 60; pointer-events: none; border-radius: 12px;
  border: 2px solid rgba(126, 224, 138, 0.95); box-shadow: 0 0 0 3px rgba(126, 224, 138, 0.25), 0 0 18px rgba(126, 224, 138, 0.55);
  animation: tutorial-guide-anchor-pulse 1.4s ease-in-out infinite;
}
@keyframes tutorial-guide-anchor-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { #${OUTLINE_ID} { animation: none; } }`;
  document.head.appendChild(style);
};
