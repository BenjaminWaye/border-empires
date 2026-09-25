// Dismissal for every Space View panel (Senate, Duke, Settings): a close button,
// pressing anywhere outside, and Escape. It watches the panels' `hidden`
// attribute rather than hooking each open/close site, so it covers panels
// whatever code opens them. Also marks the screen while a panel is open so the
// stylesheet can, on phones, tuck the HUD away behind the bottom sheet.
export const CLOSE_BUTTON_SIZE = 32;
export const MOBILE_MAX_WIDTH = 600;

type Rect = { left: number; top: number; right: number };

// Desktop: beside the panel's top-left corner, clear of the top bar. Phone: above
// the bottom sheet's top-right corner.
export const closeButtonPosition = (panel: Rect, viewportWidth: number): { left: number; top: number } =>
  viewportWidth <= MOBILE_MAX_WIDTH
    ? { left: panel.right - CLOSE_BUTTON_SIZE, top: panel.top - CLOSE_BUTTON_SIZE - 8 }
    : { left: panel.left - CLOSE_BUTTON_SIZE - 8, top: panel.top + 8 };

export type PanelDismissalOptions = {
  panelSelector?: string;
  // Presses inside these never count as "outside" (the top bar and HUD have
  // their own controls that open panels).
  keepOpenSelector?: string;
};

export type PanelDismissal = { closeAll: () => void; dispose: () => void };

export const mountPanelDismissal = (screen: HTMLElement, options: PanelDismissalOptions = {}): PanelDismissal => {
  const panelSelector = options.panelSelector ?? ".sv-settings-panel";
  const keepOpenSelector = options.keepOpenSelector ?? ".sv-settings-panel, .sv-top-bar, .dk-hud, .sv-panel-close";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sv-panel-close";
  button.setAttribute("aria-label", "Close");
  button.textContent = "×";
  button.hidden = true;
  screen.appendChild(button);

  const panels = (): HTMLElement[] => Array.from(screen.querySelectorAll<HTMLElement>(panelSelector));
  const openPanel = (): HTMLElement | undefined => panels().find((p) => !p.hidden);

  const place = (): void => {
    const panel = openPanel();
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const origin = screen.getBoundingClientRect();
    const pos = closeButtonPosition({ left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left }, window.innerWidth);
    button.style.left = `${Math.max(4, pos.left)}px`;
    button.style.top = `${Math.max(4, pos.top)}px`;
  };

  const sync = (): void => {
    const open = openPanel() !== undefined;
    screen.classList.toggle("sv-panel-open", open);
    button.hidden = !open;
    if (open) place();
  };

  const closeAll = (): void => {
    for (const p of panels()) p.hidden = true;
    sync();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!openPanel()) return;
    const target = event.target as Element | null;
    if (target?.closest(keepOpenSelector)) return;
    closeAll();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && openPanel()) closeAll();
  };
  const onButtonClick = (): void => closeAll();

  const observer = new MutationObserver(sync);
  for (const p of panels()) observer.observe(p, { attributes: true, attributeFilter: ["hidden"] });
  // A panel's size changes as its content does; keep the button beside it.
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place);
  for (const p of panels()) resizeObserver?.observe(p);

  screen.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);
  button.addEventListener("click", onButtonClick);
  window.addEventListener("resize", place);
  sync();

  return {
    closeAll,
    dispose: () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      screen.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      button.remove();
    }
  };
};
