// The town screen's bottom bar (Garrison, Raise flag, ◁ Map and the text links above them) grows with what
// it holds: a wrapped link row or a Garrison button that says why it can't be afforded made it taller than
// the fixed 118px it was capped at on phones, so it scrolled and the buttons were cut off (2026-11-18
// playtest). Its measured height is published as --v2c-town-bar-h so the panels above end where it starts.

export const TOWN_BAR_HEIGHT_VAR = "--v2c-town-bar-h";

/** Publishes the bar's rendered height (including the safe-area padding) on its parent. */
export const syncTownBarHeight = (bar: HTMLElement | null): void => {
  const host = bar?.parentElement;
  if (!bar || !host) return;
  const height = Math.ceil(bar.getBoundingClientRect().height);
  // Hidden or not laid out yet (happy-dom, display: none): keep the stylesheet's fallback.
  if (height <= 0) host.style.removeProperty(TOWN_BAR_HEIGHT_VAR);
  else host.style.setProperty(TOWN_BAR_HEIGHT_VAR, `${height}px`);
};
