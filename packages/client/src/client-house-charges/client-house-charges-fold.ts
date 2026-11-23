// Show on map folds the hand away (owner 2026-11-19: "folds the cards
// together, the card I press on moves to the side with the other cards
// beneath it"). The panel closes at once so the map can move; copies of the
// cards stay on screen for a moment, gather under the pressed card and fly into
// the docked cards at the edge of the map (client-house-charges-bubble.ts),
// which then show the pressed card face up on top. Tapping the dock opens the
// panel again, where the cards are drawn back out (client-house-charges-deck.css).
// Purely visual: nothing here changes state, and it is skipped under reduced
// motion or without the Web Animations API.

const LAYER_CLASS = "hcd-fold-layer";
const FOLD_MS = 700;

type Box = { left: number; top: number; width: number; height: number };

/** Where the docked cards sit: measured from a hidden copy, since the dock is removed while the panel is open. */
const dockBox = (): Box => {
  const probe = document.createElement("div");
  probe.className = "hcb-root is-docked";
  probe.style.visibility = "hidden";
  probe.style.animation = "none";
  probe.innerHTML = '<span class="hcb-orb"></span>';
  document.body.appendChild(probe);
  const rect = probe.querySelector(".hcb-orb")!.getBoundingClientRect();
  probe.remove();
  return rect.width > 0 ? rect : { left: 24, top: window.innerHeight / 2 - 23, width: 46, height: 46 };
};

const reducedMotion = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const centre = (box: Box): { x: number; y: number } => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * Animates copies of the panel's cards folding into the dock, the pressed card last and on top. Call it before
 * the panel closes; it returns at once and cleans up after itself.
 */
export const foldHouseChargeCards = (panelEl: HTMLElement, pressedId: string): void => {
  if (typeof document === "undefined" || reducedMotion() || typeof Element.prototype.animate !== "function") return;
  const cards = Array.from(panelEl.querySelectorAll<HTMLElement>(".hcd-card"));
  const pressed = cards.find((card) => card.querySelector(`[data-house-charge-jump="${CSS.escape(pressedId)}"]`));
  if (!pressed) return;
  document.querySelector(`.${LAYER_CLASS}`)?.remove();
  const layer = document.createElement("div");
  layer.className = LAYER_CLASS;
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  const dock = centre(dockBox());
  const gather = centre(pressed.getBoundingClientRect());
  const others = cards.filter((card) => card !== pressed);
  const order = [...others, pressed];
  let remaining = order.length;
  const done = (): void => {
    remaining -= 1;
    if (remaining <= 0) layer.remove();
  };
  order.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    if (rect.width === 0) return done();
    const copy = card.cloneNode(true) as HTMLElement;
    copy.classList.add("is-folding");
    // The copies are pictures: no live Keep / Show on map hooks for anything querying the document meanwhile.
    copy.querySelectorAll("[data-house-charge-jump], [data-house-charge-pick]").forEach((button) => {
      button.removeAttribute("data-house-charge-jump");
      button.removeAttribute("data-house-charge-pick");
    });
    Object.assign(copy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    layer.appendChild(copy);
    const from = centre(rect);
    const isPressed = card === pressed;
    const tilt = isPressed ? 0 : index % 2 === 0 ? -10 : 10;
    const scale = Math.min(46 / rect.width, 64 / rect.height);
    const animation = copy.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${gather.x - from.x}px, ${gather.y - from.y}px) rotate(${tilt / 2}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(${dock.x - from.x}px, ${dock.y - from.y}px) rotate(${tilt}deg) scale(${scale})`, opacity: isPressed ? 1 : 0.6 }
      ],
      { duration: FOLD_MS, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "forwards" }
    );
    animation.onfinish = done;
    animation.oncancel = done;
  });
  // Belt and braces: never leave copies on screen.
  window.setTimeout(() => layer.remove(), FOLD_MS + 400);
};
