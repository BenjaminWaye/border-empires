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
  manufactory: '[data-hud-v2-action="build_manufactory"], [data-v2-build-pick="build_manufactory"], [data-action="build_manufactory"], [data-v2-build-category="town_support"]',
  manpower: '[data-hud-v2-open="manpower"]',
  manifest: '[data-hud-v2-open="manifest"]',
  afc: '[data-hud-v2-open="afc"]',
  activity: '[data-hud-v2-open="chronicle"]',
  diplomacy: '.hud-v2-bubble[data-hud-v2-open="diplomacy"]'
};

/** A fixed outline must stay inside the viewport and every clipping panel. */
const anchorFullyVisible = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) return false;
  // Root overflow clips the viewport, already checked above; a fixed HUD can
  // sit outside the body's layout bounds, so only inspect inner containers.
  for (let parent = element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow);
    if (!clipX && !clipY) continue;
    const bounds = parent.getBoundingClientRect();
    if (clipX && (rect.left < bounds.left || rect.right > bounds.right)) return false;
    if (clipY && (rect.top < bounds.top || rect.bottom > bounds.bottom)) return false;
  }
  return true;
};

/** The first matching element that is actually laid out on screen. */
export const findGuideAnchorElement = (anchor: GuideAnchorId, root: ParentNode = document): Element | undefined => {
  for (const selector of GUIDE_ANCHOR_SELECTORS[anchor].split(",")) {
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (anchorFullyVisible(el)) return el;
    }
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
