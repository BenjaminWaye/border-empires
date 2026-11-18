// The town screen's bottom bar (Garrison, Raise flag, ◁ Map and the text links above them) grows with what
// it holds: a wrapped link row or a Garrison button that says why it can't be afforded made it taller than
// the fixed 118px it was capped at on phones, so it scrolled and the buttons were cut off (2026-11-18
// playtest). Its measured height is published as --v2c-town-bar-h so the panels above end where it starts.
// The bar also changes height without a town re-render (rotating the phone, the auto-settle Yes/No row
// swapped in place, the dvh cap moving with the browser toolbar), so a ResizeObserver keeps it current.

export const TOWN_BAR_HEIGHT_VAR = "--v2c-town-bar-h";

/** Publishes the bar's rendered height (including the safe-area padding) on its parent. */
export const syncTownBarHeight = (bar: HTMLElement | null): void => {
  const host = bar?.parentElement;
  if (!bar || !host) return;
  const height = Math.ceil(bar.getBoundingClientRect().height);
  const current = host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR);
  // Hidden or not laid out yet (happy-dom, display: none): keep the stylesheet's fallback.
  if (height <= 0) {
    if (current) host.style.removeProperty(TOWN_BAR_HEIGHT_VAR);
    return;
  }
  // Writing an unchanged value would still invalidate styles under the screen host on every render.
  if (current !== `${height}px`) host.style.setProperty(TOWN_BAR_HEIGHT_VAR, `${height}px`);
};

let observer: ResizeObserver | undefined;
let observed: HTMLElement | undefined;

/** Measures the bar now and again whenever it resizes; re-targets if the screen rebuilt the bar element. */
export const watchTownBarHeight = (bar: HTMLElement | null): void => {
  syncTownBarHeight(bar);
  if (!bar || bar === observed || typeof ResizeObserver === "undefined") return;
  observer?.disconnect();
  observer = new ResizeObserver(() => syncTownBarHeight(observed ?? null));
  observer.observe(bar);
  observed = bar;
};

/** Town screen closed: stop observing and drop the measured height from the shared screen host. */
export const unwatchTownBarHeight = (): void => {
  observer?.disconnect();
  observed?.parentElement?.style.removeProperty(TOWN_BAR_HEIGHT_VAR);
  observer = undefined;
  observed = undefined;
};
