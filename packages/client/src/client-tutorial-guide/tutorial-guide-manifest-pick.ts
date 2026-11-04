// Marks the Manifest the guide wants the player to commission first
// (RECOMMENDED_FIRST_MANIFEST_ID) wherever the Manifest tree is on screen:
// the new HUD's Manifest screen (client-hud-v2-manifest.ts nodes) and the
// legacy tech panel's tree (client-tech-tree-html.ts cards). Adds a pulsing
// ring and a "Guide pick" badge to the node itself, so it scrolls and clips
// with the tree instead of floating over it.
//
// Both trees rebuild their markup with innerHTML (the legacy one on every HUD
// render), which drops the mark. While a pick is shown, a MutationObserver
// re-marks rebuilt nodes in the same task, before the browser paints, so the
// badge doesn't flicker or restart its pulse. Pure DOM, so it is the same
// under the 2D and true-3D map renderers.

const MARK_CLASS = "tg-manifest-pick";
const BADGE_CLASS = "tg-manifest-pick-badge";
const STYLE_ID = "tutorial-guide-manifest-pick-styles";

/** The tree nodes for `techId` in both Manifest trees (not the small "Leads to" / owned-list links that share data-tech-card). */
export const guideManifestPickSelector = (techId: string): string => `.v2m-node[data-v2-manifest-select="${techId}"], .tech-card[data-tech-card="${techId}"]`;

let observed: { root: ParentNode; techId: string; observer: MutationObserver } | undefined;

const unmark = (el: Element): void => {
  el.classList.remove(MARK_CLASS);
  el.querySelector(`:scope > .${BADGE_CLASS}`)?.remove();
};

const markNodes = (root: ParentNode, selector: string): void => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.classList.contains(MARK_CLASS));
  if (nodes.length === 0) return;
  injectStyles();
  for (const el of nodes) {
    el.classList.add(MARK_CLASS);
    // The badge sits on the node's corner; the new HUD's nodes are already absolutely positioned.
    if (typeof getComputedStyle === "function" && getComputedStyle(el).position === "static") el.style.position = "relative";
    const badge = el.ownerDocument.createElement("span");
    badge.className = BADGE_CLASS;
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "Guide pick";
    el.appendChild(badge);
  }
};

/** Watches `root` while a pick is shown so a rebuilt tree is re-marked before paint; stops when cleared. */
const syncObserver = (root: ParentNode, techId: string | undefined): void => {
  if (observed && (observed.root !== root || observed.techId !== techId)) {
    observed.observer.disconnect();
    observed = undefined;
  }
  if (!techId || observed || typeof MutationObserver === "undefined") return;
  const selector = guideManifestPickSelector(techId);
  const observer = new MutationObserver(() => markNodes(root, selector));
  observer.observe(root as Node, { childList: true, subtree: true });
  observed = { root, techId, observer };
};

/** Marks the nodes for `techId` (or clears every mark when undefined). Call each frame; cheap when nothing changed. */
export const syncGuideManifestPick = (techId: string | undefined, root: ParentNode | undefined = typeof document === "undefined" ? undefined : document): void => {
  if (!root) return;
  syncObserver(root, techId);
  const selector = techId ? guideManifestPickSelector(techId) : undefined;
  for (const el of Array.from(root.querySelectorAll(`.${MARK_CLASS}`))) {
    if (!selector || !el.matches(selector)) unmark(el);
  }
  if (selector) markNodes(root, selector);
};

const injectStyles = (): void => {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.${MARK_CLASS} {
  outline: 2px solid rgba(126, 224, 138, 0.95) !important; outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(126, 224, 138, 0.25), 0 0 18px rgba(126, 224, 138, 0.55) !important;
  animation: tutorial-guide-manifest-pick-pulse 1.4s ease-in-out infinite;
}
.${BADGE_CLASS} {
  position: absolute; top: -9px; right: -6px; z-index: 2; pointer-events: none;
  padding: 1px 6px; border-radius: 999px; background: #7ee08a; color: #0d1a0f;
  font-size: 10px; font-weight: 800; line-height: 15px; letter-spacing: 0.02em; white-space: nowrap;
}
@keyframes tutorial-guide-manifest-pick-pulse { 0%, 100% { outline-color: rgba(126, 224, 138, 0.95); } 50% { outline-color: rgba(126, 224, 138, 0.4); } }
@media (prefers-reduced-motion: reduce) { .${MARK_CLASS} { animation: none; } }`;
  document.head.appendChild(style);
};
