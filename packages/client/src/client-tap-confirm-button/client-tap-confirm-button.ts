// The confirm step of "select first, then confirm" (client-tile-interaction.ts).
// Owner requirement: the confirm button must be front and centre, so a second
// tap is fast and the prompt can't be missed. It floats right above the point
// the player just tapped (where the selected tile and the thumb already are),
// not in a side panel or drawer, and shows the action and its cost. It is a
// screen-space DOM element anchored to the tap point, so it works the same
// over the 2D canvas and the true-3D renderer. No animation: one tap confirms.
//
// Any press elsewhere (a pan, a wheel zoom, another tile, a menu button) hides
// it; the selection itself stays armed, so re-tapping the tile still confirms.

export type ConfirmOffer = {
  label: string;
  cost?: string | undefined;
  disabled?: boolean | undefined;
};

/** A fixed offer, or a getter re-read while the prompt is up (an attack's cost lands when its preview arrives). */
export type ConfirmOfferSource = ConfirmOffer | (() => ConfirmOffer | undefined);

// How often a live offer is re-read while the prompt is showing.
export const CONFIRM_OFFER_REFRESH_MS = 250;

export type TapConfirmButton = {
  /** Remember where the player just tapped; offers anchor there. Also hides any open prompt. */
  notePoint: (clientX: number, clientY: number) => void;
  /** Show the prompt for this action at the last tap point. `undefined` (nothing to confirm) hides it. */
  offer: (action: ConfirmOfferSource | undefined, onConfirm: () => void) => void;
  hide: () => void;
  isVisible: () => boolean;
};

// Above the fingertip, so the thumb that just tapped doesn't cover it.
const FINGER_GAP_PX = 28;
// Same top clamp the tile sheet uses (client-tile-action-menu-ui.ts): the HUD's top bar sits above it.
const TOP_SAFE_PX = 78;
const EDGE_PX = 8;

/** Where the prompt goes: centred above the tap, flipped below it when there's no room above, kept on screen. */
export const tapConfirmButtonPosition = (input: {
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}): { left: number; top: number } => {
  const { clientX, clientY, width, height, viewportWidth, viewportHeight } = input;
  const above = clientY - FINGER_GAP_PX - height;
  const rawTop = above >= TOP_SAFE_PX ? above : clientY + FINGER_GAP_PX;
  const left = Math.max(EDGE_PX, Math.min(viewportWidth - width - EDGE_PX, clientX - width / 2));
  const top = Math.max(EDGE_PX, Math.min(viewportHeight - height - EDGE_PX, rawTop));
  return { left, top };
};

export const createTapConfirmButton = (doc: Document = document): TapConfirmButton => {
  let button: HTMLButtonElement | undefined;
  let confirm: (() => void) | undefined;
  let point = { x: 0, y: 0 };
  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  const hide = (): void => {
    confirm = undefined;
    if (refreshTimer !== undefined) clearInterval(refreshTimer);
    refreshTimer = undefined;
    if (button) button.style.display = "none";
  };

  const ensureButton = (): HTMLButtonElement => {
    if (button) return button;
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "tap-confirm-btn";
    el.style.display = "none";
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const run = confirm;
      hide();
      run?.();
    });
    doc.body.appendChild(el);
    const view = doc.defaultView;
    // Capture phase, so it runs before the map's own handlers see the press.
    view?.addEventListener("pointerdown", (ev) => {
      if (!(ev.target instanceof Node) || !el.contains(ev.target)) hide();
    }, true);
    view?.addEventListener("wheel", hide, { capture: true, passive: true });
    button = el;
    return el;
  };

  // Fills the prompt's label and cost, and sets what a press does.
  const render = (el: HTMLButtonElement, action: ConfirmOffer, onConfirm: () => void): void => {
    el.replaceChildren();
    const label = doc.createElement("span");
    label.className = "tap-confirm-label";
    label.textContent = action.label;
    el.appendChild(label);
    if (action.cost) {
      const cost = doc.createElement("span");
      cost.className = "tap-confirm-cost";
      cost.textContent = action.cost;
      el.appendChild(cost);
    }
    el.disabled = Boolean(action.disabled);
    confirm = action.disabled ? undefined : onConfirm;
  };

  const offer = (source: ConfirmOfferSource | undefined, onConfirm: () => void): void => {
    hide();
    const read = (): ConfirmOffer | undefined => (typeof source === "function" ? source() : source);
    const action = read();
    if (!action) return;
    const el = ensureButton();
    render(el, action, onConfirm);
    el.style.display = "flex";
    if (typeof source === "function") {
      let shown = JSON.stringify(action);
      refreshTimer = setInterval(() => {
        const next = read();
        if (!next) {
          hide();
          return;
        }
        const text = JSON.stringify(next);
        if (text === shown) return;
        shown = text;
        render(el, next, onConfirm);
      }, CONFIRM_OFFER_REFRESH_MS);
    }
    const view = doc.defaultView;
    const { left, top } = tapConfirmButtonPosition({
      clientX: point.x,
      clientY: point.y,
      width: el.offsetWidth || 220,
      height: el.offsetHeight || 64,
      viewportWidth: view?.innerWidth ?? 1024,
      viewportHeight: view?.innerHeight ?? 768
    });
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };

  return {
    notePoint: (clientX, clientY) => {
      point = { x: clientX, y: clientY };
      hide();
    },
    offer,
    hide,
    isVisible: () => Boolean(button && button.style.display !== "none")
  };
};
