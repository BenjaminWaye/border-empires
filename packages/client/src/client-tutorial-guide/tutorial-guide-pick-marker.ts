// Marks the node the guide wants the player to pick (a Manifest in the tree, an
// AFC upgrade card) with a pulsing ring and a "Guide pick" badge on the node
// itself, so it scrolls and clips with its container instead of floating over
// it. Both containers rebuild their markup with innerHTML, which drops the
// mark; while a pick is shown, a MutationObserver re-marks rebuilt nodes in
// the same task, before the browser paints, so the badge doesn't flicker or
// restart its pulse. Pure DOM, so it is the same under the 2D and true-3D map
// renderers. Each pick kind has its own marker and only ever clears its own
// marks (data-tg-pick), so two kinds synced in the same frame don't fight.

const MARK_CLASS = "tg-manifest-pick";
const BADGE_CLASS = "tg-manifest-pick-badge";
const STYLE_ID = "tutorial-guide-manifest-pick-styles";

const unmark = (el: Element): void => {
  el.classList.remove(MARK_CLASS);
  el.removeAttribute("data-tg-pick");
  el.querySelector(`:scope > .${BADGE_CLASS}`)?.remove();
};

const markNodes = (root: ParentNode, selector: string, kind: string): void => {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.classList.contains(MARK_CLASS));
  if (nodes.length === 0) return;
  injectStyles();
  for (const el of nodes) {
    el.classList.add(MARK_CLASS);
    el.setAttribute("data-tg-pick", kind);
    // The badge sits on the node's corner; the new HUD's nodes are already absolutely positioned.
    if (typeof getComputedStyle === "function" && getComputedStyle(el).position === "static") el.style.position = "relative";
    const badge = el.ownerDocument.createElement("span");
    badge.className = BADGE_CLASS;
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "Guide pick";
    el.appendChild(badge);
  }
};

/** Returns a sync function for one pick kind: pass the selector to mark, or undefined to clear this kind's marks. Call each frame; cheap when nothing changed. */
export const createGuidePickMarker = (kind: string): ((selector: string | undefined, root?: ParentNode) => void) => {
  let observed: { root: ParentNode; selector: string; observer: MutationObserver } | undefined;
  return (selector, root = typeof document === "undefined" ? undefined : document) => {
    if (!root) return;
    if (observed && (observed.root !== root || observed.selector !== selector)) {
      observed.observer.disconnect();
      observed = undefined;
    }
    if (selector && !observed && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(() => markNodes(root, selector, kind));
      observer.observe(root as Node, { childList: true, subtree: true });
      observed = { root, selector, observer };
    }
    for (const el of Array.from(root.querySelectorAll(`[data-tg-pick="${kind}"]`))) {
      if (!selector || !el.matches(selector)) unmark(el);
    }
    if (selector) markNodes(root, selector, kind);
  };
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
